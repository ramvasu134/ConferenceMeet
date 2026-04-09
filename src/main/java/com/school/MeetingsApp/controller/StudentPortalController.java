package com.school.MeetingsApp.controller;

import com.school.MeetingsApp.model.*;
import com.school.MeetingsApp.repository.MeetingRepository;
import com.school.MeetingsApp.repository.StudentRepository;
import com.school.MeetingsApp.service.BroadcastService;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.*;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

@Controller
public class StudentPortalController {

    private final BroadcastService broadcastService;
    private final MeetingRepository meetingRepository;
    private final StudentRepository studentRepository;

    public StudentPortalController(BroadcastService broadcastService, MeetingRepository meetingRepository,
                                    StudentRepository studentRepository) {
        this.broadcastService = broadcastService;
        this.meetingRepository = meetingRepository;
        this.studentRepository = studentRepository;
    }

    // ============ PAGES ============

    @GetMapping("/student/login")
    public String studentLoginPage() {
        // Redirect to unified login page
        return "redirect:/login";
    }

    @GetMapping("/student/dashboard")
    public String studentDashboard(Authentication auth, HttpSession session, Model model) {
        if (auth == null) return "redirect:/login";

        String username = auth.getName();

        // Check if session already has studentId (set by success handler)
        Long studentId = (Long) session.getAttribute("studentId");
        if (studentId != null) {
            model.addAttribute("studentId", studentId);
            model.addAttribute("studentName", session.getAttribute("studentName"));
            model.addAttribute("teacherName", session.getAttribute("teacherName"));
            model.addAttribute("studentAvatar", session.getAttribute("studentAvatar") != null ? session.getAttribute("studentAvatar") : "avatar-1");
            return "student-dashboard";
        }

        // Fallback: look up student by username
        Optional<Student> studentOpt = studentRepository.findByUsernameWithTeacher(username);
        if (studentOpt.isEmpty()) return "redirect:/login";

        Student s = studentOpt.get();
        session.setAttribute("studentId", s.getId());
        session.setAttribute("studentName", s.getName());
        session.setAttribute("studentUsername", s.getUsername());
        session.setAttribute("teacherName", s.getTeacher().getName());
        session.setAttribute("teacherId", s.getTeacher().getId());
        session.setAttribute("studentAvatar", s.getAvatar() != null ? s.getAvatar() : "avatar-1");
        broadcastService.markStudentOnline(s.getId());

        model.addAttribute("studentId", s.getId());
        model.addAttribute("studentName", s.getName());
        model.addAttribute("teacherName", s.getTeacher().getName());
        model.addAttribute("studentAvatar", s.getAvatar() != null ? s.getAvatar() : "avatar-1");
        return "student-dashboard";
    }

    // ============ AUTH API (kept for backward compatibility) ============

    @PostMapping("/api/student/login")
    @ResponseBody
    public ResponseEntity<?> studentLogin(@RequestBody Map<String, String> body, HttpSession session) {
        String username = body.get("username");
        String password = body.get("password");

        Optional<Student> student = broadcastService.authenticateStudent(username, password);
        if (student.isEmpty()) {
            return ResponseEntity.status(401).body(Map.of("error", "Invalid credentials or account blocked"));
        }

        Student s = student.get();
        session.setAttribute("studentId", s.getId());
        session.setAttribute("studentName", s.getName());
        session.setAttribute("studentUsername", s.getUsername());
        session.setAttribute("teacherName", s.getTeacher().getName());
        session.setAttribute("teacherId", s.getTeacher().getId());
        session.setAttribute("studentAvatar", s.getAvatar() != null ? s.getAvatar() : "avatar-1");

        broadcastService.markStudentOnline(s.getId());

        return ResponseEntity.ok(Map.of(
                "studentId", s.getId(),
                "name", s.getName(),
                "teacherName", s.getTeacher().getName(),
                "avatar", s.getAvatar() != null ? s.getAvatar() : "avatar-1"
        ));
    }

    @PostMapping("/api/student/logout")
    @ResponseBody
    public ResponseEntity<?> studentLogout(HttpSession session) {
        Long studentId = (Long) session.getAttribute("studentId");
        if (studentId != null) broadcastService.markStudentOffline(studentId);
        session.invalidate();
        return ResponseEntity.ok(Map.of("message", "Logged out"));
    }

    // ============ BROADCAST POLL (Student listens to teacher) ============

    @GetMapping("/api/student/broadcast/poll")
    @ResponseBody
    public ResponseEntity<?> pollBroadcast(HttpSession session,
                                            @RequestParam(defaultValue = "-1") int afterChunk) {
        Long studentId = (Long) session.getAttribute("studentId");
        if (studentId == null) return ResponseEntity.status(401).body(Map.of("error", "Not logged in"));

        // Find ANY active meeting (not just from student's teacher)
        // This allows students to hear any teacher/manager who starts a meeting
        Optional<Meeting> activeMeeting = meetingRepository.findAll().stream()
                .filter(Meeting::isActive)
                .findFirst();

        if (activeMeeting.isEmpty()) {
            return ResponseEntity.ok(Map.of("active", false, "chunks", List.of()));
        }

        Meeting meeting = activeMeeting.get();
        List<BroadcastChunk> newChunks = broadcastService.getChunksAfter(meeting.getId(), afterChunk);

        List<Map<String, Object>> chunkData = newChunks.stream().map(c -> {
            Map<String, Object> m = new HashMap<>();
            m.put("id", c.getId());
            m.put("chunkIndex", c.getChunkIndex());
            return m;
        }).collect(Collectors.toList());

        Map<String, Object> resp = new HashMap<>();
        resp.put("active", true);
        resp.put("meetingId", meeting.getId());
        resp.put("chunks", chunkData);
        return ResponseEntity.ok(resp);
    }

    @GetMapping("/api/student/broadcast/chunk/{chunkId}")
    @ResponseBody
    public ResponseEntity<byte[]> getBroadcastChunk(@PathVariable Long chunkId) {
        Optional<BroadcastChunk> chunk = broadcastService.getChunk(chunkId);
        if (chunk.isPresent() && chunk.get().getAudioData() != null) {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.parseMediaType("audio/webm"));
            return new ResponseEntity<>(chunk.get().getAudioData(), headers, HttpStatus.OK);
        }
        return ResponseEntity.notFound().build();
    }

    // ============ DOUBT CLIPS (Student records and submits) ============

    @PostMapping("/api/student/doubt")
    @ResponseBody
    public ResponseEntity<?> submitDoubt(HttpSession session,
                                          @RequestParam("audio") MultipartFile file,
                                          @RequestParam(value = "meetingId", required = false) Long meetingId,
                                          @RequestParam(value = "duration", defaultValue = "0") long duration) {
        Long studentId = (Long) session.getAttribute("studentId");
        if (studentId == null) return ResponseEntity.status(401).body(Map.of("error", "Not logged in"));

        try {
            DoubtClip clip = broadcastService.saveDoubtClip(meetingId, studentId, file.getBytes(), duration);
            return ResponseEntity.ok(Map.of("id", clip.getId(), "fileName", clip.getFileName()));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/api/student/doubts")
    @ResponseBody
    public ResponseEntity<?> getMyDoubts(HttpSession session) {
        Long studentId = (Long) session.getAttribute("studentId");
        if (studentId == null) return ResponseEntity.status(401).body(Map.of("error", "Not logged in"));

        DateTimeFormatter fmt = DateTimeFormatter.ofPattern("M/d/yyyy h:mm a");
        List<DoubtClip> doubts = broadcastService.getDoubtsByStudent(studentId);
        List<Map<String, Object>> result = doubts.stream().map(d -> {
            Map<String, Object> m = new HashMap<>();
            m.put("id", d.getId());
            m.put("fileName", d.getFileName());
            m.put("durationSeconds", d.getDurationSeconds());
            m.put("answered", d.isAnswered());
            m.put("answerNote", d.getAnswerNote());
            m.put("hasAnswerAudio", d.getAnswerAudioData() != null);
            m.put("createdAt", d.getCreatedAt().format(fmt));
            return m;
        }).collect(Collectors.toList());
        return ResponseEntity.ok(result);
    }

    @GetMapping("/api/student/doubt/{id}/play")
    @ResponseBody
    public ResponseEntity<byte[]> playDoubtClip(@PathVariable Long id) {
        Optional<DoubtClip> clip = broadcastService.getDoubtClip(id);
        if (clip.isPresent() && clip.get().getAudioData() != null) {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.parseMediaType("audio/webm"));
            return new ResponseEntity<>(clip.get().getAudioData(), headers, HttpStatus.OK);
        }
        return ResponseEntity.notFound().build();
    }

    @GetMapping("/api/student/doubt/{id}/answer-audio")
    @ResponseBody
    public ResponseEntity<byte[]> playAnswerAudio(@PathVariable Long id) {
        Optional<DoubtClip> clip = broadcastService.getDoubtClip(id);
        if (clip.isPresent() && clip.get().getAnswerAudioData() != null) {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.parseMediaType("audio/webm"));
            return new ResponseEntity<>(clip.get().getAnswerAudioData(), headers, HttpStatus.OK);
        }
        return ResponseEntity.notFound().build();
    }

    // ============ TEACHER APIs for doubt management ============

    @GetMapping("/api/doubts")
    @ResponseBody
    public ResponseEntity<?> getDoubtsForTeacher(@RequestParam(required = false) Long meetingId,
                                                  @RequestParam(defaultValue = "false") boolean unansweredOnly,
                                                  org.springframework.security.core.Authentication auth) {
        DateTimeFormatter fmt = DateTimeFormatter.ofPattern("M/d/yyyy h:mm a");
        List<DoubtClip> doubts;

        if (meetingId != null) {
            doubts = broadcastService.getDoubtsByMeeting(meetingId);
        } else if (unansweredOnly) {
            doubts = broadcastService.getUnansweredDoubts(auth.getName());
        } else {
            doubts = broadcastService.getAllDoubtsByTeacher(auth.getName());
        }

        List<Map<String, Object>> result = doubts.stream().map(d -> {
            Map<String, Object> m = new HashMap<>();
            m.put("id", d.getId());
            m.put("studentName", d.getStudent().getName());
            m.put("studentUsername", d.getStudent().getUsername());
            m.put("fileName", d.getFileName());
            m.put("durationSeconds", d.getDurationSeconds());
            m.put("answered", d.isAnswered());
            m.put("answerNote", d.getAnswerNote());
            m.put("createdAt", d.getCreatedAt().format(fmt));
            return m;
        }).collect(Collectors.toList());
        return ResponseEntity.ok(result);
    }

    @GetMapping("/api/doubts/{id}/play")
    @ResponseBody
    public ResponseEntity<byte[]> teacherPlayDoubt(@PathVariable Long id) {
        return playDoubtClip(id);
    }

    @PostMapping("/api/doubts/{id}/answer")
    @ResponseBody
    public ResponseEntity<?> answerDoubt(@PathVariable Long id,
                                          @RequestParam(value = "note", required = false) String note,
                                          @RequestParam(value = "audio", required = false) MultipartFile audio) {
        try {
            byte[] audioData = (audio != null && !audio.isEmpty()) ? audio.getBytes() : null;
            DoubtClip clip = broadcastService.answerDoubt(id, note, audioData);
            return ResponseEntity.ok(Map.of("id", clip.getId(), "answered", true));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    // ============ BROADCAST UPLOAD (Teacher sends audio chunks) ============

    @PostMapping("/api/broadcast/chunk")
    @ResponseBody
    public ResponseEntity<?> uploadBroadcastChunk(@RequestParam("audio") MultipartFile file,
                                                   @RequestParam("meetingId") Long meetingId) {
        try {
            BroadcastChunk chunk = broadcastService.saveBroadcastChunk(meetingId, file.getBytes());
            return ResponseEntity.ok(Map.of("id", chunk.getId(), "chunkIndex", chunk.getChunkIndex()));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}

