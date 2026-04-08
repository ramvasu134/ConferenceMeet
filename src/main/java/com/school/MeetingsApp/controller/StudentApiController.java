package com.school.MeetingsApp.controller;

import com.school.MeetingsApp.dto.CreateStudentRequest;
import com.school.MeetingsApp.dto.StudentDTO;
import com.school.MeetingsApp.service.StudentService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/students")
public class StudentApiController {

    private final StudentService studentService;

    public StudentApiController(StudentService studentService) {
        this.studentService = studentService;
    }

    @GetMapping
    public List<StudentDTO> getStudents(Authentication auth,
                                         @RequestParam(required = false) String search) {
        if (search != null && !search.trim().isEmpty()) {
            return studentService.searchStudents(auth.getName(), search.trim());
        }
        return studentService.getStudentsByTeacher(auth.getName());
    }

    @PostMapping
    public ResponseEntity<?> createStudent(Authentication auth, @RequestBody CreateStudentRequest request) {
        try {
            StudentDTO student = studentService.createStudent(auth.getName(), request);
            return ResponseEntity.ok(student);
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> updateStudent(@PathVariable Long id, @RequestBody CreateStudentRequest request) {
        try {
            StudentDTO student = studentService.updateStudent(id, request);
            return ResponseEntity.ok(student);
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteStudent(@PathVariable Long id) {
        studentService.deleteStudent(id);
        return ResponseEntity.ok(Map.of("message", "Student deleted"));
    }

    @PostMapping("/{id}/block")
    public ResponseEntity<StudentDTO> toggleBlock(@PathVariable Long id) {
        return ResponseEntity.ok(studentService.toggleBlock(id));
    }

    @PostMapping("/{id}/mute")
    public ResponseEntity<StudentDTO> toggleMute(@PathVariable Long id) {
        return ResponseEntity.ok(studentService.toggleMute(id));
    }
}

