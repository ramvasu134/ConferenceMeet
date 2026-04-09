package com.school.MeetingsApp;

import com.school.MeetingsApp.dto.CreateStudentRequest;
import com.school.MeetingsApp.dto.StudentDTO;
import com.school.MeetingsApp.model.*;
import com.school.MeetingsApp.repository.*;
import com.school.MeetingsApp.service.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

/**
 * UNIT TESTS — Core service logic: recordings, broadcast chunks, doubt clips,
 * student CRUD, meeting lifecycle, authentication, and role management.
 * 
 * Special focus on the RECORDING pipeline — the heart of the application.
 */
@SpringBootTest
@Transactional
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class ServiceUnitTests {

    @Autowired private BroadcastService broadcastService;
    @Autowired private StudentService studentService;
    @Autowired private MeetingService meetingService;
    @Autowired private TeacherService teacherService;
    @Autowired private CustomUserDetailsService userDetailsService;

    @Autowired private TeacherRepository teacherRepo;
    @Autowired private StudentRepository studentRepo;
    @Autowired private MeetingRepository meetingRepo;
    @Autowired private BroadcastChunkRepository chunkRepo;
    @Autowired private RecordingRepository recordingRepo;
    @Autowired private DoubtClipRepository doubtRepo;

    @Autowired private PasswordEncoder passwordEncoder;

    private Teacher admin;
    private Teacher manager;

    @BeforeEach
    void setUp() {
        // Create ADMIN
        if (teacherRepo.findByUsername("testadmin").isEmpty()) {
            admin = new Teacher("Test Admin", "testadmin", passwordEncoder.encode("admin123"), "ADMIN");
            admin = teacherRepo.save(admin);
        } else {
            admin = teacherRepo.findByUsername("testadmin").get();
        }

        // Create MANAGER
        if (teacherRepo.findByUsername("testmanager").isEmpty()) {
            manager = new Teacher("Test Manager", "testmanager", passwordEncoder.encode("mgr123"), "MANAGER");
            manager = teacherRepo.save(manager);
        } else {
            manager = teacherRepo.findByUsername("testmanager").get();
        }
    }

    // ================================================================================
    //  ❤️ RECORDING PIPELINE — THE HEART OF THE APPLICATION
    //  Broadcast chunks, meeting recordings, doubt clips, audio data integrity
    // ================================================================================

    @Test
    @Order(1)
    @DisplayName("RECORDING: Save broadcast chunk with audio data — data integrity preserved")
    void saveBroadcastChunk_dataIntegrityPreserved() {
        Meeting meeting = meetingService.startMeeting("testadmin");
        assertNotNull(meeting.getId());

        // Simulate 5-second audio chunk (48kHz mono 16-bit ≈ 480KB for 5sec)
        byte[] audioData = generateFakeAudioData(480_000);

        BroadcastChunk chunk = broadcastService.saveBroadcastChunk(meeting.getId(), audioData);

        assertNotNull(chunk.getId(), "Chunk should be persisted with an ID");
        assertEquals(0, chunk.getChunkIndex(), "First chunk should have index 0");
        assertEquals(480_000, chunk.getFileSize(), "File size should match audio data length");
        assertArrayEquals(audioData, chunk.getAudioData(), "Audio data must be byte-for-byte identical — NO corruption");
    }

    @Test
    @Order(2)
    @DisplayName("RECORDING: Multiple broadcast chunks get sequential indices")
    void saveBroadcastChunks_sequentialIndices() {
        Meeting meeting = meetingService.startMeeting("testadmin");

        BroadcastChunk c0 = broadcastService.saveBroadcastChunk(meeting.getId(), generateFakeAudioData(1000));
        BroadcastChunk c1 = broadcastService.saveBroadcastChunk(meeting.getId(), generateFakeAudioData(2000));
        BroadcastChunk c2 = broadcastService.saveBroadcastChunk(meeting.getId(), generateFakeAudioData(3000));

        assertEquals(0, c0.getChunkIndex());
        assertEquals(1, c1.getChunkIndex());
        assertEquals(2, c2.getChunkIndex());
    }

    @Test
    @Order(3)
    @DisplayName("RECORDING: Poll chunks after index returns only newer chunks")
    void getChunksAfter_returnsOnlyNewerChunks() {
        Meeting meeting = meetingService.startMeeting("testadmin");

        broadcastService.saveBroadcastChunk(meeting.getId(), generateFakeAudioData(1000));
        broadcastService.saveBroadcastChunk(meeting.getId(), generateFakeAudioData(1000));
        broadcastService.saveBroadcastChunk(meeting.getId(), generateFakeAudioData(1000));

        // Student polls — already has chunk 0, wants chunks after index 0
        List<BroadcastChunk> newChunks = broadcastService.getChunksAfter(meeting.getId(), 0);
        assertEquals(2, newChunks.size(), "Should return chunks 1 and 2");
        assertEquals(1, newChunks.get(0).getChunkIndex());
        assertEquals(2, newChunks.get(1).getChunkIndex());

        // Poll with -1 should return ALL chunks
        List<BroadcastChunk> allChunks = broadcastService.getChunksAfter(meeting.getId(), -1);
        assertEquals(3, allChunks.size(), "afterIndex=-1 should return all 3 chunks");
    }

    @Test
    @Order(4)
    @DisplayName("RECORDING: Retrieve individual chunk by ID with audio data")
    void getChunk_retrieveWithAudioData() {
        Meeting meeting = meetingService.startMeeting("testadmin");
        byte[] audio = generateFakeAudioData(50_000);
        BroadcastChunk saved = broadcastService.saveBroadcastChunk(meeting.getId(), audio);

        Optional<BroadcastChunk> retrieved = broadcastService.getChunk(saved.getId());
        assertTrue(retrieved.isPresent());
        assertArrayEquals(audio, retrieved.get().getAudioData(),
                "Retrieved chunk audio must be byte-for-byte identical to saved audio");
    }

    @Test
    @Order(5)
    @DisplayName("RECORDING: Save meeting recording — full session audio preserved")
    void saveMeetingRecording_fullSessionPreserved() {
        Meeting meeting = meetingService.startMeeting("testadmin");
        byte[] fullSessionAudio = generateFakeAudioData(5_000_000); // ~5MB full session

        Recording recording = meetingService.saveRecording(
                meeting.getId(), null, "testadmin",
                fullSessionAudio, "meeting_recording_test.webm", 3600
        );

        assertNotNull(recording.getId());
        assertEquals("meeting_recording_test.webm", recording.getFileName());
        assertEquals(3600, recording.getDurationSeconds());
        assertEquals(5_000_000, recording.getFileSize());
        assertArrayEquals(fullSessionAudio, recording.getAudioData(),
                "Full meeting recording audio data must be preserved without corruption");
    }

    @Test
    @Order(6)
    @DisplayName("RECORDING: List recordings by teacher — ordered by createdAt desc")
    void getRecordings_orderedByCreatedAtDesc() {
        meetingService.saveRecording(null, null, "testadmin", generateFakeAudioData(100), "rec1.webm", 10);
        meetingService.saveRecording(null, null, "testadmin", generateFakeAudioData(200), "rec2.webm", 20);
        meetingService.saveRecording(null, null, "testadmin", generateFakeAudioData(300), "rec3.webm", 30);

        List<Recording> recordings = meetingService.getRecordings("testadmin");
        assertTrue(recordings.size() >= 3, "Should have at least 3 recordings");
        // Newest first
        assertTrue(recordings.get(0).getCreatedAt().compareTo(recordings.get(1).getCreatedAt()) >= 0);
    }

    @Test
    @Order(7)
    @DisplayName("RECORDING: Delete recording removes it from DB")
    void deleteRecording_removesFromDB() {
        Recording rec = meetingService.saveRecording(null, null, "testadmin",
                generateFakeAudioData(500), "to_delete.webm", 5);
        Long id = rec.getId();

        meetingService.deleteRecording(id);

        Optional<Recording> deleted = meetingService.getRecording(id);
        assertTrue(deleted.isEmpty(), "Deleted recording should not be retrievable");
    }

    // ================================================================================
    //  ❤️ DOUBT CLIPS — Student voice recordings
    // ================================================================================

    @Test
    @Order(10)
    @DisplayName("DOUBT: Save doubt clip with audio — data integrity preserved")
    void saveDoubtClip_dataIntegrity() {
        Student student = createTestStudent("doubttest1", "doubttest1");
        Meeting meeting = meetingService.startMeeting("testadmin");

        byte[] doubtAudio = generateFakeAudioData(24_000); // ~0.5 second

        DoubtClip clip = broadcastService.saveDoubtClip(meeting.getId(), student.getId(), doubtAudio, 5);

        assertNotNull(clip.getId());
        assertEquals(student.getId(), clip.getStudent().getId());
        assertEquals(admin.getId(), clip.getTeacher().getId(), "Teacher should be auto-set from student's teacher");
        assertEquals(5, clip.getDurationSeconds());
        assertFalse(clip.isAnswered(), "New doubt should not be answered");
        assertArrayEquals(doubtAudio, clip.getAudioData(),
                "Doubt audio data must be exactly preserved — no corruption or truncation");
        assertTrue(clip.getFileName().startsWith("doubt_doubttest1_"), "Filename should contain student username");
    }

    @Test
    @Order(11)
    @DisplayName("DOUBT: Save doubt clip WITHOUT meeting ID — still saves correctly")
    void saveDoubtClip_withoutMeetingId() {
        Student student = createTestStudent("doubttest2", "doubttest2");
        byte[] audio = generateFakeAudioData(10_000);

        DoubtClip clip = broadcastService.saveDoubtClip(null, student.getId(), audio, 3);

        assertNotNull(clip.getId());
        assertNull(clip.getMeeting(), "Meeting should be null when not provided");
        assertArrayEquals(audio, clip.getAudioData());
    }

    @Test
    @Order(12)
    @DisplayName("DOUBT: Answer doubt with note and audio")
    void answerDoubt_withNoteAndAudio() {
        Student student = createTestStudent("doubttest3", "doubttest3");
        DoubtClip clip = broadcastService.saveDoubtClip(null, student.getId(), generateFakeAudioData(5000), 2);

        byte[] answerAudio = generateFakeAudioData(8000);
        DoubtClip answered = broadcastService.answerDoubt(clip.getId(), "Good question!", answerAudio);

        assertTrue(answered.isAnswered());
        assertEquals("Good question!", answered.getAnswerNote());
        assertNotNull(answered.getAnsweredAt());
        assertArrayEquals(answerAudio, answered.getAnswerAudioData(),
                "Answer audio data must be preserved exactly");
    }

    @Test
    @Order(13)
    @DisplayName("DOUBT: Get doubts by student — ordered by createdAt desc")
    void getDoubtsByStudent_ordered() {
        Student student = createTestStudent("doubttest4", "doubttest4");
        broadcastService.saveDoubtClip(null, student.getId(), generateFakeAudioData(1000), 1);
        broadcastService.saveDoubtClip(null, student.getId(), generateFakeAudioData(2000), 2);

        List<DoubtClip> doubts = broadcastService.getDoubtsByStudent(student.getId());
        assertEquals(2, doubts.size());
        // Newest first
        assertTrue(doubts.get(0).getCreatedAt().compareTo(doubts.get(1).getCreatedAt()) >= 0);
    }

    @Test
    @Order(14)
    @DisplayName("DOUBT: Get unanswered doubts for teacher")
    void getUnansweredDoubts_filtersCorrectly() {
        Student student = createTestStudent("doubttest5", "doubttest5");
        DoubtClip d1 = broadcastService.saveDoubtClip(null, student.getId(), generateFakeAudioData(1000), 1);
        broadcastService.saveDoubtClip(null, student.getId(), generateFakeAudioData(1000), 1);
        
        // Answer first doubt
        broadcastService.answerDoubt(d1.getId(), "Answered", null);

        List<DoubtClip> unanswered = broadcastService.getUnansweredDoubts("testadmin");
        assertTrue(unanswered.stream().noneMatch(d -> d.getId().equals(d1.getId())),
                "Answered doubt should not appear in unanswered list");
    }

    // ================================================================================
    //  STUDENT CRUD + AUTHENTICATION
    // ================================================================================

    @Test
    @Order(20)
    @DisplayName("STUDENT: Create student with BCrypt password and verify login works")
    void createStudent_andLogin_succeeds() {
        CreateStudentRequest req = new CreateStudentRequest();
        req.setName("Login Test Student");
        req.setUsername("logintest");
        req.setPassword("mypassword123");
        req.setDeviceLock(false);
        req.setShowRecordings(true);

        StudentDTO created = studentService.createStudent("testadmin", req);
        assertNotNull(created.getId());
        assertEquals("Login Test Student", created.getName());

        // Now verify the student can authenticate (this is the CRITICAL login path)
        Optional<Student> authenticated = broadcastService.authenticateStudent("logintest", "mypassword123");
        assertTrue(authenticated.isPresent(), "Student MUST be able to login with the password used during creation");
        assertEquals("Login Test Student", authenticated.get().getName());
    }

    @Test
    @Order(21)
    @DisplayName("STUDENT: Login fails with wrong password")
    void studentLogin_wrongPassword_fails() {
        createTestStudent("wrongpwdtest", "wrongpwdtest");

        Optional<Student> result = broadcastService.authenticateStudent("wrongpwdtest", "wrongpassword");
        assertTrue(result.isEmpty(), "Login should fail with incorrect password");
    }

    @Test
    @Order(22)
    @DisplayName("STUDENT: Login fails when student is blocked")
    void studentLogin_blocked_fails() {
        Student student = createTestStudent("blockedtest", "blockedtest");
        studentService.toggleBlock(student.getId()); // block the student

        Optional<Student> result = broadcastService.authenticateStudent("blockedtest", "student123");
        assertTrue(result.isEmpty(), "Blocked student should NOT be able to login");
    }

    @Test
    @Order(23)
    @DisplayName("STUDENT: Login fails for non-existent username")
    void studentLogin_nonExistent_fails() {
        Optional<Student> result = broadcastService.authenticateStudent("nonexistent_user", "anypassword");
        assertTrue(result.isEmpty());
    }

    @Test
    @Order(24)
    @DisplayName("STUDENT: Duplicate username rejected")
    void createStudent_duplicateUsername_rejected() {
        createTestStudent("duptest", "duptest");

        CreateStudentRequest req2 = new CreateStudentRequest();
        req2.setName("Duplicate");
        req2.setUsername("duptest");
        req2.setPassword("pass");

        assertThrows(RuntimeException.class, () -> studentService.createStudent("testadmin", req2),
                "Should throw exception for duplicate username");
    }

    @Test
    @Order(25)
    @DisplayName("STUDENT: Update student password — new password works, old doesn't")
    void updateStudent_passwordChange_worksCorrectly() {
        Student student = createTestStudent("pwdchangetest", "pwdchangetest");

        CreateStudentRequest update = new CreateStudentRequest();
        update.setName("Updated Name");
        update.setPassword("newpassword456");
        update.setDeviceLock(false);
        update.setShowRecordings(true);

        studentService.updateStudent(student.getId(), update);

        // New password should work
        Optional<Student> auth = broadcastService.authenticateStudent("pwdchangetest", "newpassword456");
        assertTrue(auth.isPresent(), "New password should authenticate");

        // Old password should NOT work
        Optional<Student> oldAuth = broadcastService.authenticateStudent("pwdchangetest", "student123");
        assertTrue(oldAuth.isEmpty(), "Old password should NOT authenticate after change");
    }

    @Test
    @Order(26)
    @DisplayName("STUDENT: Toggle block/unblock works")
    void toggleBlock_worksCorrectly() {
        Student student = createTestStudent("blocktest", "blocktest");

        StudentDTO blocked = studentService.toggleBlock(student.getId());
        assertTrue(blocked.isBlocked());

        StudentDTO unblocked = studentService.toggleBlock(student.getId());
        assertFalse(unblocked.isBlocked());
    }

    @Test
    @Order(27)
    @DisplayName("STUDENT: Toggle mute/unmute works")
    void toggleMute_worksCorrectly() {
        Student student = createTestStudent("mutetest", "mutetest");

        StudentDTO muted = studentService.toggleMute(student.getId());
        assertTrue(muted.isMuted());

        StudentDTO unmuted = studentService.toggleMute(student.getId());
        assertFalse(unmuted.isMuted());
    }

    @Test
    @Order(28)
    @DisplayName("STUDENT: Mark online/offline updates correctly")
    void markOnlineOffline_updatesCorrectly() {
        Student student = createTestStudent("onlinetest", "onlinetest");

        broadcastService.markStudentOnline(student.getId());
        Student online = studentRepo.findById(student.getId()).get();
        assertTrue(online.isOnline());

        broadcastService.markStudentOffline(student.getId());
        Student offline = studentRepo.findById(student.getId()).get();
        assertFalse(offline.isOnline());
        assertNotNull(offline.getLastSeen(), "lastSeen should be set when going offline");
    }

    // ================================================================================
    //  MEETING LIFECYCLE
    // ================================================================================

    @Test
    @Order(30)
    @DisplayName("MEETING: Start meeting creates active meeting")
    void startMeeting_createsActive() {
        Meeting meeting = meetingService.startMeeting("testadmin");
        assertNotNull(meeting.getId());
        assertTrue(meeting.isActive());
        assertNotNull(meeting.getStartTime());
        assertNull(meeting.getEndTime());
    }

    @Test
    @Order(31)
    @DisplayName("MEETING: End meeting deactivates and sets endTime")
    void endMeeting_deactivatesAndSetsEndTime() {
        meetingService.startMeeting("testadmin");

        Meeting ended = meetingService.endMeeting("testadmin");
        assertFalse(ended.isActive());
        assertNotNull(ended.getEndTime());
    }

    @Test
    @Order(32)
    @DisplayName("MEETING: Starting new meeting ends previous active meeting")
    void startMeeting_endsPreviousActive() {
        Meeting first = meetingService.startMeeting("testadmin");
        Long firstId = first.getId();

        Meeting second = meetingService.startMeeting("testadmin");
        assertNotEquals(firstId, second.getId());

        // First meeting should no longer be active
        Meeting firstUpdated = meetingRepo.findById(firstId).get();
        assertFalse(firstUpdated.isActive(), "Previous meeting should be ended");
        assertNotNull(firstUpdated.getEndTime());
    }

    @Test
    @Order(33)
    @DisplayName("MEETING: Get active meeting returns correct meeting")
    void getActiveMeeting_returnsCorrect() {
        meetingService.startMeeting("testadmin");

        Optional<Meeting> active = meetingService.getActiveMeeting("testadmin");
        assertTrue(active.isPresent());
        assertTrue(active.get().isActive());
    }

    @Test
    @Order(34)
    @DisplayName("MEETING: Chat message saved and retrieved with correct order")
    void chatMessage_savedAndRetrieved() {
        Meeting meeting = meetingService.startMeeting("testadmin");

        meetingService.addChatMessage(meeting.getId(), "Admin", "teacher", "Hello class!");
        meetingService.addChatMessage(meeting.getId(), "Student1", "student", "Hi teacher!");

        var messages = meetingService.getChatMessages(meeting.getId());
        assertEquals(2, messages.size());
        assertEquals("Hello class!", messages.get(0).getContent());
        assertEquals("Hi teacher!", messages.get(1).getContent());
    }

    // ================================================================================
    //  ROLE SYSTEM — ADMIN / MANAGER
    // ================================================================================

    @Test
    @Order(40)
    @DisplayName("ROLE: Admin user has ADMIN role")
    void adminHasCorrectRole() {
        assertEquals("ADMIN", admin.getRole());
    }

    @Test
    @Order(41)
    @DisplayName("ROLE: Manager user has MANAGER role")
    void managerHasCorrectRole() {
        assertEquals("MANAGER", manager.getRole());
    }

    @Test
    @Order(42)
    @DisplayName("ROLE: CustomUserDetailsService assigns correct Spring Security roles")
    void userDetailsService_assignsCorrectRoles() {
        var adminDetails = userDetailsService.loadUserByUsername("testadmin");
        assertTrue(adminDetails.getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals("ROLE_ADMIN")));

        var managerDetails = userDetailsService.loadUserByUsername("testmanager");
        assertTrue(managerDetails.getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals("ROLE_MANAGER")));
    }

    @Test
    @Order(43)
    @DisplayName("ROLE: Create manager — succeeds with correct role")
    void createManager_succeeds() {
        Teacher mgr = teacherService.createManager("New Mgr", "newmgr_test", "pass123");
        assertNotNull(mgr.getId());
        assertEquals("MANAGER", mgr.getRole());
        assertTrue(passwordEncoder.matches("pass123", mgr.getPassword()));
    }

    @Test
    @Order(44)
    @DisplayName("ROLE: Duplicate manager username rejected")
    void createManager_duplicateUsername_rejected() {
        teacherService.createManager("Dup Mgr", "dupmgr_test", "pass123");
        assertThrows(RuntimeException.class,
                () -> teacherService.createManager("Dup Mgr2", "dupmgr_test", "pass456"));
    }

    @Test
    @Order(45)
    @DisplayName("ROLE: Update manager — name and password")
    void updateManager_nameAndPassword() {
        Teacher mgr = teacherService.createManager("Old Name", "updmgr_test", "oldpass");

        Teacher updated = teacherService.updateManager(mgr.getId(), "New Name", "newpass");
        assertEquals("New Name", updated.getName());
        assertTrue(passwordEncoder.matches("newpass", updated.getPassword()));
    }

    @Test
    @Order(46)
    @DisplayName("ROLE: Cannot edit non-manager as manager")
    void updateManager_cannotEditAdmin() {
        assertThrows(RuntimeException.class,
                () -> teacherService.updateManager(admin.getId(), "Hacked", "hacked"));
    }

    @Test
    @Order(47)
    @DisplayName("ROLE: Delete manager works, delete admin blocked")
    void deleteManager_worksForManager_blockedForAdmin() {
        Teacher toDelete = teacherService.createManager("Delete Me", "delmgr_test", "pass");
        assertDoesNotThrow(() -> teacherService.deleteManager(toDelete.getId()));

        assertThrows(RuntimeException.class,
                () -> teacherService.deleteManager(admin.getId()),
                "Should not be able to delete admin as 'manager'");
    }

    // ================================================================================
    //  TEACHER SETTINGS
    // ================================================================================

    @Test
    @Order(50)
    @DisplayName("SETTINGS: Change password — old fails, new works")
    void changePassword_oldFailsNewWorks() {
        teacherService.changePassword("testadmin", "admin123", "newadminpass");

        assertThrows(RuntimeException.class,
                () -> teacherService.changePassword("testadmin", "admin123", "whatever"),
                "Old password should no longer work");

        assertDoesNotThrow(() -> teacherService.changePassword("testadmin", "newadminpass", "admin123"),
                "New password should work");
    }

    @Test
    @Order(51)
    @DisplayName("SETTINGS: Update theme, speak detection type")
    void updateSettings_worksCorrectly() {
        teacherService.updateSettings("testadmin", "ocean", "push", true);

        Teacher updated = teacherService.getByUsername("testadmin");
        assertEquals("ocean", updated.getTheme());
        assertEquals("push", updated.getSpeakDetectionType());
        assertTrue(updated.isFullMeetingRecording());
    }

    // ================================================================================
    //  HELPERS
    // ================================================================================

    private byte[] generateFakeAudioData(int size) {
        byte[] data = new byte[size];
        // Simulate real audio waveform pattern (not all zeros)
        for (int i = 0; i < size; i++) {
            data[i] = (byte) (Math.sin(i * 0.1) * 127);
        }
        return data;
    }

    private Student createTestStudent(String name, String username) {
        if (studentRepo.findByUsername(username).isPresent()) {
            return studentRepo.findByUsername(username).get();
        }
        Student student = new Student(name, username, passwordEncoder.encode("student123"), admin);
        return studentRepo.save(student);
    }
}

