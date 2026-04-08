package com.school.MeetingsApp.controller;

import com.school.MeetingsApp.model.Teacher;
import com.school.MeetingsApp.service.TeacherService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/settings")
public class SettingsApiController {

    private final TeacherService teacherService;

    public SettingsApiController(TeacherService teacherService) {
        this.teacherService = teacherService;
    }

    @GetMapping
    public ResponseEntity<Map<String, Object>> getSettings(Authentication auth) {
        Teacher teacher = teacherService.getByUsername(auth.getName());
        return ResponseEntity.ok(Map.of(
                "name", teacher.getName(),
                "username", teacher.getUsername(),
                "theme", teacher.getTheme(),
                "speakDetectionType", teacher.getSpeakDetectionType(),
                "fullMeetingRecording", teacher.isFullMeetingRecording()
        ));
    }

    @PostMapping("/password")
    public ResponseEntity<?> changePassword(Authentication auth, @RequestBody Map<String, String> body) {
        try {
            teacherService.changePassword(auth.getName(), body.get("oldPassword"), body.get("newPassword"));
            return ResponseEntity.ok(Map.of("message", "Password changed successfully"));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/update")
    public ResponseEntity<?> updateSettings(Authentication auth, @RequestBody Map<String, Object> body) {
        String theme = (String) body.getOrDefault("theme", "dark");
        String speakDetectionType = (String) body.getOrDefault("speakDetectionType", "auto");
        boolean fullMeetingRecording = (boolean) body.getOrDefault("fullMeetingRecording", false);
        teacherService.updateSettings(auth.getName(), theme, speakDetectionType, fullMeetingRecording);
        return ResponseEntity.ok(Map.of("message", "Settings updated"));
    }

    @PostMapping("/toggle-recording")
    public ResponseEntity<?> toggleRecording(Authentication auth) {
        teacherService.toggleFullMeetingRecording(auth.getName());
        Teacher teacher = teacherService.getByUsername(auth.getName());
        return ResponseEntity.ok(Map.of("fullMeetingRecording", teacher.isFullMeetingRecording()));
    }
}

