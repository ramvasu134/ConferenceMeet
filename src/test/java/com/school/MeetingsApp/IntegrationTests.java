package com.school.MeetingsApp;

import com.school.MeetingsApp.model.Student;
import com.school.MeetingsApp.model.Teacher;
import com.school.MeetingsApp.repository.StudentRepository;
import com.school.MeetingsApp.repository.TeacherRepository;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * INTEGRATION & SANITY TESTS — Full HTTP endpoint testing including:
 * - Security (auth, role-based access)
 * - HSTS & security headers
 * - Recording upload/download endpoints
 * - Broadcast chunk upload/download
 * - Student login API
 * - Branding (page titles contain "mtng")
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class IntegrationTests {

    @Autowired private MockMvc mockMvc;
    @Autowired private TeacherRepository teacherRepo;
    @Autowired private StudentRepository studentRepo;
    @Autowired private PasswordEncoder passwordEncoder;

    private Teacher admin;

    @BeforeEach
    void setUp() {
        if (teacherRepo.findByUsername("integadmin").isEmpty()) {
            admin = new Teacher("IntegAdmin", "integadmin", passwordEncoder.encode("pass123"), "ADMIN");
            admin = teacherRepo.save(admin);
        } else {
            admin = teacherRepo.findByUsername("integadmin").get();
        }
    }

    // ================================================================================
    //  SECURITY — ACCESS CONTROL
    // ================================================================================

    @Test
    @Order(1)
    @DisplayName("SECURITY: Unauthenticated user redirected to /login")
    void unauthenticated_redirectsToLogin() throws Exception {
        mockMvc.perform(get("/dashboard"))
                .andExpect(status().is3xxRedirection())
                .andExpect(redirectedUrlPattern("**/login"));
    }

    @Test
    @Order(2)
    @DisplayName("SECURITY: Login page accessible without auth")
    void loginPage_accessible() throws Exception {
        mockMvc.perform(get("/login"))
                .andExpect(status().isOk());
    }

    @Test
    @Order(3)
    @DisplayName("SECURITY: Student login page redirects to unified login")
    void studentLoginPage_accessible() throws Exception {
        mockMvc.perform(get("/student/login"))
                .andExpect(status().is3xxRedirection())
                .andExpect(redirectedUrl("/login"));
    }

    @Test
    @Order(4)
    @DisplayName("SECURITY: Static resources accessible without auth")
    void staticResources_accessible() throws Exception {
        mockMvc.perform(get("/js/app.js")).andExpect(status().isOk());
        mockMvc.perform(get("/js/student.js")).andExpect(status().isOk());
        mockMvc.perform(get("/js/audio-processor.js")).andExpect(status().isOk());
        mockMvc.perform(get("/css/style.css")).andExpect(status().isOk());
    }

    @Test
    @Order(5)
    @DisplayName("SECURITY: API endpoints require authentication")
    @WithMockUser(username = "integadmin", roles = "ADMIN")
    void apiEndpoints_requireAuth() throws Exception {
        mockMvc.perform(get("/api/students"))
                .andExpect(status().isOk());
    }

    @Test
    @Order(6)
    @DisplayName("SECURITY: Manager API restricted to ADMIN role")
    @WithMockUser(username = "integadmin", roles = "MANAGER")
    void managerApi_restrictedToAdmin() throws Exception {
        mockMvc.perform(get("/api/managers"))
                .andExpect(status().isForbidden());
    }

    @Test
    @Order(7)
    @DisplayName("SECURITY: Manager API accessible by ADMIN role")
    @WithMockUser(username = "integadmin", roles = "ADMIN")
    void managerApi_accessibleByAdmin() throws Exception {
        mockMvc.perform(get("/api/managers"))
                .andExpect(status().isOk());
    }

    // ================================================================================
    //  SECURITY HEADERS — HSTS, X-Content-Type-Options, etc.
    // ================================================================================

    @Test
    @Order(10)
    @DisplayName("HEADERS: HSTS header present on HTTPS requests")
    @WithMockUser(username = "integadmin", roles = "ADMIN")
    void hstsHeaderPresent() throws Exception {
        // HSTS is only sent for HTTPS (secure) requests
        mockMvc.perform(get("/dashboard").secure(true))
                .andExpect(header().exists("Strict-Transport-Security"))
                .andExpect(header().string("Strict-Transport-Security",
                        containsString("max-age=31536000")))
                .andExpect(header().string("Strict-Transport-Security",
                        containsString("includeSubDomains")));
    }

    @Test
    @Order(11)
    @DisplayName("HEADERS: X-Content-Type-Options present")
    @WithMockUser(username = "integadmin", roles = "ADMIN")
    void contentTypeOptionsHeaderPresent() throws Exception {
        mockMvc.perform(get("/dashboard").secure(true))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"));
    }

    @Test
    @Order(12)
    @DisplayName("HEADERS: Permissions-Policy allows microphone for self")
    @WithMockUser(username = "integadmin", roles = "ADMIN")
    void permissionsPolicyHeaderPresent() throws Exception {
        mockMvc.perform(get("/dashboard").secure(true))
                .andExpect(header().exists("Permissions-Policy"))
                .andExpect(header().string("Permissions-Policy",
                        containsString("microphone=(self)")));
    }

    @Test
    @Order(13)
    @DisplayName("HEADERS: Referrer-Policy header present")
    @WithMockUser(username = "integadmin", roles = "ADMIN")
    void referrerPolicyHeaderPresent() throws Exception {
        mockMvc.perform(get("/dashboard").secure(true))
                .andExpect(header().string("Referrer-Policy", "strict-origin-when-cross-origin"));
    }

    // ================================================================================
    //  BRANDING — "mtng" throughout
    // ================================================================================

    @Test
    @Order(20)
    @DisplayName("BRAND: Login page title contains 'mtng'")
    void loginPageBranding() throws Exception {
        MvcResult result = mockMvc.perform(get("/login")).andExpect(status().isOk()).andReturn();
        String html = result.getResponse().getContentAsString();
        assertTrue(html.toLowerCase().contains("mtng"), "Login page should contain 'mtng' brand name");
        assertFalse(html.contains(">Air<"), "Login page should NOT contain old 'Air' brand");
    }

    @Test
    @Order(21)
    @DisplayName("BRAND: Student login redirects to unified login with MTNG branding")
    void studentLoginPageBranding() throws Exception {
        // /student/login now redirects to /login (unified login)
        mockMvc.perform(get("/student/login"))
                .andExpect(status().is3xxRedirection())
                .andExpect(redirectedUrl("/login"));
        // Verify the unified login page has MTNG branding
        MvcResult result = mockMvc.perform(get("/login")).andExpect(status().isOk()).andReturn();
        String html = result.getResponse().getContentAsString();
        assertTrue(html.toLowerCase().contains("mtng"), "Unified login should contain 'mtng' brand");
    }

    @Test
    @Order(22)
    @DisplayName("BRAND: Dashboard page contains 'mtng' brand")
    @WithMockUser(username = "integadmin", roles = "ADMIN")
    void dashboardBranding() throws Exception {
        MvcResult result = mockMvc.perform(get("/dashboard")).andExpect(status().isOk()).andReturn();
        String html = result.getResponse().getContentAsString();
        assertTrue(html.contains("mtng"), "Dashboard should contain 'mtng' brand");
    }

    @Test
    @Order(23)
    @DisplayName("BRAND: Orbitron font loaded for brand styling")
    void orbitronFontLoaded() throws Exception {
        MvcResult result = mockMvc.perform(get("/login")).andExpect(status().isOk()).andReturn();
        String html = result.getResponse().getContentAsString();
        assertTrue(html.contains("Orbitron"), "Login page should include Orbitron font");
    }

    @Test
    @Order(24)
    @DisplayName("BRAND: WhatsApp message in app.js uses 'mtng'")
    void whatsappMessageBranding() throws Exception {
        MvcResult result = mockMvc.perform(get("/js/app.js")).andExpect(status().isOk()).andReturn();
        String js = result.getResponse().getContentAsString();
        assertTrue(js.contains("mtng"), "app.js should use 'mtng' in WhatsApp messages");
        assertFalse(js.contains("Air Meetings"), "app.js should NOT contain old 'Air Meetings'");
        assertFalse(js.contains("Air MeetingsApp"), "app.js should NOT contain old 'Air MeetingsApp'");
    }

    // ================================================================================
    //  ❤️ RECORDING ENDPOINTS — Upload / Download / Delete
    // ================================================================================

    @Test
    @Order(30)
    @DisplayName("RECORDING API: Upload recording with audio data")
    @WithMockUser(username = "integadmin", roles = "ADMIN")
    void uploadRecording_succeeds() throws Exception {
        // First start a meeting
        mockMvc.perform(post("/api/meeting/start").with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").exists());

        // Upload recording (simulating audio file)
        byte[] audioData = generateFakeAudio(10_000);
        MockMultipartFile audioFile = new MockMultipartFile("audio", "test_recording.webm",
                "audio/webm", audioData);

        mockMvc.perform(multipart("/api/recordings/upload")
                        .file(audioFile)
                        .param("duration", "60")
                        .with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").exists())
                .andExpect(jsonPath("$.fileName").exists());
    }

    @Test
    @Order(31)
    @DisplayName("RECORDING API: List recordings returns results")
    @WithMockUser(username = "integadmin", roles = "ADMIN")
    void listRecordings_returnsResults() throws Exception {
        // Upload a recording first
        MockMultipartFile audioFile = new MockMultipartFile("audio", "test.webm",
                "audio/webm", generateFakeAudio(5_000));
        mockMvc.perform(multipart("/api/recordings/upload")
                        .file(audioFile)
                        .param("duration", "30")
                        .with(csrf()))
                .andExpect(status().isOk());

        // List recordings
        mockMvc.perform(get("/api/recordings"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(greaterThanOrEqualTo(1))))
                .andExpect(jsonPath("$[0].fileName").exists())
                .andExpect(jsonPath("$[0].durationSeconds").exists())
                .andExpect(jsonPath("$[0].fileSize").exists());
    }

    @Test
    @Order(32)
    @DisplayName("RECORDING API: Play recording returns audio/webm content")
    @WithMockUser(username = "integadmin", roles = "ADMIN")
    void playRecording_returnsAudio() throws Exception {
        byte[] audioData = generateFakeAudio(8_000);
        MockMultipartFile audioFile = new MockMultipartFile("audio", "play_test.webm",
                "audio/webm", audioData);

        MvcResult uploadResult = mockMvc.perform(multipart("/api/recordings/upload")
                        .file(audioFile)
                        .param("duration", "15")
                        .with(csrf()))
                .andExpect(status().isOk())
                .andReturn();

        // Extract recording ID
        String json = uploadResult.getResponse().getContentAsString();
        Long recId = com.fasterxml.jackson.databind.json.JsonMapper.builder().build()
                .readTree(json).get("id").asLong();

        // Play it back
        mockMvc.perform(get("/api/recordings/" + recId + "/play"))
                .andExpect(status().isOk())
                .andExpect(content().contentType("audio/webm"))
                .andExpect(content().bytes(audioData));
    }

    // ================================================================================
    //  ❤️ BROADCAST CHUNK ENDPOINTS — The real-time voice pipeline
    // ================================================================================

    @Test
    @Order(40)
    @DisplayName("BROADCAST API: Upload broadcast chunk succeeds")
    @WithMockUser(username = "integadmin", roles = "ADMIN")
    void uploadBroadcastChunk_succeeds() throws Exception {
        // Start meeting
        MvcResult meetingResult = mockMvc.perform(post("/api/meeting/start").with(csrf()))
                .andExpect(status().isOk()).andReturn();

        Long meetingId = com.fasterxml.jackson.databind.json.JsonMapper.builder().build()
                .readTree(meetingResult.getResponse().getContentAsString()).get("id").asLong();

        // Upload chunk
        byte[] chunkData = generateFakeAudio(48_000); // 1 second of audio
        MockMultipartFile chunkFile = new MockMultipartFile("audio", "chunk_0.webm",
                "audio/webm", chunkData);

        mockMvc.perform(multipart("/api/broadcast/chunk")
                        .file(chunkFile)
                        .param("meetingId", meetingId.toString())
                        .with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").exists())
                .andExpect(jsonPath("$.chunkIndex").value(0));
    }

    @Test
    @Order(41)
    @DisplayName("BROADCAST API: Multiple chunks get sequential indices")
    @WithMockUser(username = "integadmin", roles = "ADMIN")
    void uploadMultipleChunks_sequentialIndices() throws Exception {
        MvcResult meetingResult = mockMvc.perform(post("/api/meeting/start").with(csrf()))
                .andExpect(status().isOk()).andReturn();
        Long meetingId = com.fasterxml.jackson.databind.json.JsonMapper.builder().build()
                .readTree(meetingResult.getResponse().getContentAsString()).get("id").asLong();

        for (int i = 0; i < 3; i++) {
            MockMultipartFile chunk = new MockMultipartFile("audio", "chunk_" + i + ".webm",
                    "audio/webm", generateFakeAudio(5_000));
            mockMvc.perform(multipart("/api/broadcast/chunk")
                            .file(chunk)
                            .param("meetingId", meetingId.toString())
                            .with(csrf()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.chunkIndex").value(i));
        }
    }

    // ================================================================================
    //  STUDENT LOGIN API — The critical auth path
    // ================================================================================

    @Test
    @Order(50)
    @DisplayName("STUDENT LOGIN API: Valid credentials return student info")
    void studentLogin_validCredentials_succeeds() throws Exception {
        // Create a student directly in DB
        Student student = new Student("API Test Student", "apitest_student",
                passwordEncoder.encode("testpass"), admin);
        student = studentRepo.save(student);

        mockMvc.perform(post("/api/student/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"apitest_student\",\"password\":\"testpass\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.studentId").value(student.getId()))
                .andExpect(jsonPath("$.name").value("API Test Student"))
                .andExpect(jsonPath("$.teacherName").value("IntegAdmin"));
    }

    @Test
    @Order(51)
    @DisplayName("STUDENT LOGIN API: Wrong password returns 401")
    void studentLogin_wrongPassword_returns401() throws Exception {
        Student student = new Student("Bad Login", "badlogin_student",
                passwordEncoder.encode("correctpass"), admin);
        studentRepo.save(student);

        mockMvc.perform(post("/api/student/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"badlogin_student\",\"password\":\"wrongpass\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").exists());
    }

    @Test
    @Order(52)
    @DisplayName("STUDENT LOGIN API: Blocked student returns 401")
    void studentLogin_blocked_returns401() throws Exception {
        Student student = new Student("Blocked", "blocked_student",
                passwordEncoder.encode("pass"), admin);
        student.setBlocked(true);
        studentRepo.save(student);

        mockMvc.perform(post("/api/student/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"blocked_student\",\"password\":\"pass\"}"))
                .andExpect(status().isUnauthorized());
    }

    // ================================================================================
    //  STUDENT CRUD API
    // ================================================================================

    @Test
    @Order(60)
    @DisplayName("STUDENT API: Create student succeeds")
    @WithMockUser(username = "integadmin", roles = "ADMIN")
    void createStudent_api_succeeds() throws Exception {
        mockMvc.perform(post("/api/students")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"New API Student\",\"username\":\"newapistudent\",\"password\":\"pass123\",\"deviceLock\":false,\"showRecordings\":true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("New API Student"))
                .andExpect(jsonPath("$.username").value("newapistudent"));
    }

    @Test
    @Order(61)
    @DisplayName("STUDENT API: Duplicate username returns error")
    @WithMockUser(username = "integadmin", roles = "ADMIN")
    void createStudent_api_duplicateRejected() throws Exception {
        // Create first
        mockMvc.perform(post("/api/students")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"First\",\"username\":\"dup_api\",\"password\":\"pass\",\"deviceLock\":false,\"showRecordings\":true}"));

        // Try duplicate
        mockMvc.perform(post("/api/students")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Second\",\"username\":\"dup_api\",\"password\":\"pass\",\"deviceLock\":false,\"showRecordings\":true}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Username already exists"));
    }

    // ================================================================================
    //  MEETING API
    // ================================================================================

    @Test
    @Order(70)
    @DisplayName("MEETING API: Start meeting returns active meeting")
    @WithMockUser(username = "integadmin", roles = "ADMIN")
    void startMeeting_api_returnsActive() throws Exception {
        mockMvc.perform(post("/api/meeting/start").with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").exists())
                .andExpect(jsonPath("$.active").value(true))
                .andExpect(jsonPath("$.startTime").exists());
    }

    @Test
    @Order(71)
    @DisplayName("MEETING API: End meeting returns inactive meeting")
    @WithMockUser(username = "integadmin", roles = "ADMIN")
    void endMeeting_api_returnsInactive() throws Exception {
        mockMvc.perform(post("/api/meeting/start").with(csrf()));

        mockMvc.perform(post("/api/meeting/end").with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.active").value(false))
                .andExpect(jsonPath("$.endTime").exists());
    }

    @Test
    @Order(72)
    @DisplayName("MEETING API: Get active meeting status")
    @WithMockUser(username = "integadmin", roles = "ADMIN")
    void getActiveMeeting_api() throws Exception {
        mockMvc.perform(post("/api/meeting/start").with(csrf()));

        mockMvc.perform(get("/api/meeting/active"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.active").value(true))
                .andExpect(jsonPath("$.id").exists());
    }

    // ================================================================================
    //  HELPERS
    // ================================================================================

    private byte[] generateFakeAudio(int size) {
        byte[] data = new byte[size];
        for (int i = 0; i < size; i++) {
            data[i] = (byte) (Math.sin(i * 0.05) * 127);
        }
        return data;
    }
}

