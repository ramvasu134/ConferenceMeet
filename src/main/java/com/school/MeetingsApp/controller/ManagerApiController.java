package com.school.MeetingsApp.controller;

import com.school.MeetingsApp.model.Teacher;
import com.school.MeetingsApp.service.TeacherService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/managers")
public class ManagerApiController {

    private final TeacherService teacherService;

    public ManagerApiController(TeacherService teacherService) {
        this.teacherService = teacherService;
    }

    @GetMapping
    public ResponseEntity<List<Map<String, Object>>> getManagers() {
        DateTimeFormatter fmt = DateTimeFormatter.ofPattern("M/d/yyyy");
        List<Map<String, Object>> result = teacherService.getManagers().stream().map(m -> {
            Map<String, Object> map = new HashMap<>();
            map.put("id", m.getId());
            map.put("name", m.getName());
            map.put("username", m.getUsername());
            map.put("createdAt", m.getCreatedAt() != null ? m.getCreatedAt().format(fmt) : "");
            map.put("avatar", m.getAvatar() != null ? m.getAvatar() : "avatar-1");
            return map;
        }).collect(Collectors.toList());
        return ResponseEntity.ok(result);
    }

    @PostMapping
    public ResponseEntity<?> createManager(@RequestBody Map<String, String> body) {
        try {
            String name = body.get("name");
            String username = body.get("username");
            String password = body.get("password");
            if (name == null || name.isBlank() || username == null || username.isBlank() || password == null || password.isBlank()) {
                return ResponseEntity.badRequest().body(Map.of("error", "All fields are required"));
            }
            Teacher manager = teacherService.createManager(name.trim(), username.trim(), password);
            Map<String, Object> result = new HashMap<>();
            result.put("id", manager.getId());
            result.put("name", manager.getName());
            result.put("username", manager.getUsername());
            return ResponseEntity.ok(result);
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> updateManager(@PathVariable Long id, @RequestBody Map<String, String> body) {
        try {
            String name = body.get("name");
            String password = body.get("password");
            if (name == null || name.isBlank()) {
                return ResponseEntity.badRequest().body(Map.of("error", "Name is required"));
            }
            Teacher manager = teacherService.updateManager(id, name.trim(), password);
            Map<String, Object> result = new HashMap<>();
            result.put("id", manager.getId());
            result.put("name", manager.getName());
            result.put("username", manager.getUsername());
            return ResponseEntity.ok(result);
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteManager(@PathVariable Long id) {
        try {
            teacherService.deleteManager(id);
            return ResponseEntity.ok(Map.of("message", "Manager deleted"));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}

