package com.school.MeetingsApp.controller;

import com.school.MeetingsApp.model.Recording;
import com.school.MeetingsApp.service.MeetingService;
import org.springframework.http.*;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/recordings")
public class RecordingApiController {

    private final MeetingService meetingService;

    public RecordingApiController(MeetingService meetingService) {
        this.meetingService = meetingService;
    }

    @GetMapping
    public ResponseEntity<List<Map<String, Object>>> getRecordings(Authentication auth) {
        List<Recording> recordings = meetingService.getRecordings(auth.getName());
        DateTimeFormatter fmt = DateTimeFormatter.ofPattern("M/d/yyyy h:mm a");
        List<Map<String, Object>> result = recordings.stream().map(r -> {
            Map<String, Object> map = new HashMap<>();
            map.put("id", r.getId());
            map.put("fileName", r.getFileName());
            map.put("durationSeconds", r.getDurationSeconds());
            map.put("fileSize", r.getFileSize());
            map.put("createdAt", r.getCreatedAt().format(fmt));
            map.put("studentName", r.getStudent() != null ? r.getStudent().getName() : "Teacher");
            return map;
        }).collect(Collectors.toList());
        return ResponseEntity.ok(result);
    }

    @PostMapping("/upload")
    public ResponseEntity<?> uploadRecording(Authentication auth,
                                              @RequestParam("audio") MultipartFile file,
                                              @RequestParam(value = "meetingId", required = false) Long meetingId,
                                              @RequestParam(value = "duration", defaultValue = "0") long duration) {
        try {
            String fileName = "recording_" + System.currentTimeMillis() + ".webm";
            Recording recording = meetingService.saveRecording(meetingId, null, auth.getName(),
                    file.getBytes(), fileName, duration);
            return ResponseEntity.ok(Map.of("id", recording.getId(), "fileName", recording.getFileName()));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/{id}/play")
    public ResponseEntity<byte[]> playRecording(@PathVariable Long id) {
        Optional<Recording> recording = meetingService.getRecording(id);
        if (recording.isPresent() && recording.get().getAudioData() != null) {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.parseMediaType("audio/webm"));
            headers.setContentDisposition(ContentDisposition.inline()
                    .filename(recording.get().getFileName()).build());
            return new ResponseEntity<>(recording.get().getAudioData(), headers, HttpStatus.OK);
        }
        return ResponseEntity.notFound().build();
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteRecording(@PathVariable Long id) {
        meetingService.deleteRecording(id);
        return ResponseEntity.ok(Map.of("message", "Recording deleted"));
    }
}

