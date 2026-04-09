package com.school.MeetingsApp;

import com.school.MeetingsApp.config.HttpsRedirectFilter;
import com.school.MeetingsApp.config.SecurityConfig;
import com.school.MeetingsApp.controller.*;
import com.school.MeetingsApp.service.*;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.junit.jupiter.api.Assertions.*;

/**
 * SMOKE TESTS — Verify the application boots correctly, all beans load,
 * and critical components are wired properly.
 */
@SpringBootTest
class SmokeTests {

    @Autowired
    private ApplicationContext context;

    // ===================== APPLICATION CONTEXT =====================

    @Test
    @DisplayName("SMOKE: Application context loads successfully")
    void contextLoads() {
        assertNotNull(context, "Application context should not be null");
    }

    // ===================== CONTROLLERS LOADED =====================

    @Test
    @DisplayName("SMOKE: PageController bean exists")
    void pageControllerLoaded() {
        assertNotNull(context.getBean(PageController.class));
    }

    @Test
    @DisplayName("SMOKE: StudentApiController bean exists")
    void studentApiControllerLoaded() {
        assertNotNull(context.getBean(StudentApiController.class));
    }

    @Test
    @DisplayName("SMOKE: StudentPortalController bean exists")
    void studentPortalControllerLoaded() {
        assertNotNull(context.getBean(StudentPortalController.class));
    }

    @Test
    @DisplayName("SMOKE: MeetingApiController bean exists")
    void meetingApiControllerLoaded() {
        assertNotNull(context.getBean(MeetingApiController.class));
    }

    @Test
    @DisplayName("SMOKE: RecordingApiController bean exists")
    void recordingApiControllerLoaded() {
        assertNotNull(context.getBean(RecordingApiController.class));
    }

    // ===================== SERVICES LOADED =====================

    @Test
    @DisplayName("SMOKE: BroadcastService bean exists")
    void broadcastServiceLoaded() {
        assertNotNull(context.getBean(BroadcastService.class));
    }

    @Test
    @DisplayName("SMOKE: StudentService bean exists")
    void studentServiceLoaded() {
        assertNotNull(context.getBean(StudentService.class));
    }

    @Test
    @DisplayName("SMOKE: MeetingService bean exists")
    void meetingServiceLoaded() {
        assertNotNull(context.getBean(MeetingService.class));
    }

    @Test
    @DisplayName("SMOKE: TeacherService bean exists")
    void teacherServiceLoaded() {
        assertNotNull(context.getBean(TeacherService.class));
    }

    @Test
    @DisplayName("SMOKE: CustomUserDetailsService bean exists")
    void customUserDetailsServiceLoaded() {
        assertNotNull(context.getBean(CustomUserDetailsService.class));
    }

    // ===================== SECURITY & HTTPS BEANS =====================

    @Test
    @DisplayName("SMOKE: SecurityConfig bean exists")
    void securityConfigLoaded() {
        assertNotNull(context.getBean(SecurityConfig.class));
    }

    @Test
    @DisplayName("SMOKE: PasswordEncoder bean exists and is BCrypt")
    void passwordEncoderLoaded() {
        PasswordEncoder encoder = context.getBean(PasswordEncoder.class);
        assertNotNull(encoder);
        // Verify BCrypt encoding works
        String raw = "test123";
        String encoded = encoder.encode(raw);
        assertTrue(encoded.startsWith("$2a$") || encoded.startsWith("$2b$"),
                "Encoded password should be BCrypt format");
        assertTrue(encoder.matches(raw, encoded),
                "Password should match after encoding");
    }

    @Test
    @DisplayName("SMOKE: HttpsRedirectFilter bean exists")
    void httpsRedirectFilterLoaded() {
        assertNotNull(context.getBean(HttpsRedirectFilter.class));
    }
}

