package com.school.MeetingsApp.controller;

import com.school.MeetingsApp.model.ChatMessage;
import com.school.MeetingsApp.model.Meeting;
import com.school.MeetingsApp.model.Recording;
import com.school.MeetingsApp.service.MeetingService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/meeting")
public class MeetingApiController {

    private final MeetingService meetingService;

    public MeetingApiController(MeetingService meetingService) {
        this.meetingService = meetingService;
    }

    @PostMapping("/start")
    public ResponseEntity<Map<String, Object>> startMeeting(Authentication auth) {
        Meeting meeting = meetingService.startMeeting(auth.getName());
        Map<String, Object> response = new HashMap<>();
        response.put("id", meeting.getId());
        response.put("active", meeting.isActive());
        response.put("startTime", meeting.getStartTime().toString());
        return ResponseEntity.ok(response);
    }

    @PostMapping("/end")
    public ResponseEntity<Map<String, Object>> endMeeting(Authentication auth) {
        Meeting meeting = meetingService.endMeeting(auth.getName());
        Map<String, Object> response = new HashMap<>();
        response.put("id", meeting.getId());
        response.put("active", meeting.isActive());
        response.put("endTime", meeting.getEndTime().toString());
        return ResponseEntity.ok(response);
    }

    @GetMapping("/active")
    public ResponseEntity<?> getActiveMeeting(Authentication auth) {
        Optional<Meeting> meeting = meetingService.getActiveMeeting(auth.getName());
        if (meeting.isPresent()) {
            Map<String, Object> response = new HashMap<>();
            response.put("id", meeting.get().getId());
            response.put("active", true);
            response.put("startTime", meeting.get().getStartTime().toString());
            response.put("participantCount", meeting.get().getParticipants().size());
            return ResponseEntity.ok(response);
        }
        return ResponseEntity.ok(Map.of("active", false));
    }

    @GetMapping("/{meetingId}/chat")
    public ResponseEntity<List<Map<String, String>>> getChatMessages(@PathVariable Long meetingId) {
        List<ChatMessage> messages = meetingService.getChatMessages(meetingId);
        DateTimeFormatter fmt = DateTimeFormatter.ofPattern("h:mm a");
        List<Map<String, String>> result = messages.stream().map(m -> {
            Map<String, String> msg = new HashMap<>();
            msg.put("senderName", m.getSenderName());
            msg.put("senderRole", m.getSenderRole());
            msg.put("content", m.getContent());
            msg.put("timestamp", m.getTimestamp().format(fmt));
            return msg;
        }).collect(Collectors.toList());
        return ResponseEntity.ok(result);
    }

    @PostMapping("/{meetingId}/chat")
    public ResponseEntity<Map<String, String>> sendChat(@PathVariable Long meetingId,
                                                         @RequestBody Map<String, String> body,
                                                         Authentication auth) {
        String content = body.get("content");
        ChatMessage message = meetingService.addChatMessage(meetingId, auth.getName(), "TEACHER", content);
        DateTimeFormatter fmt = DateTimeFormatter.ofPattern("h:mm a");
        Map<String, String> response = new HashMap<>();
        response.put("senderName", message.getSenderName());
        response.put("senderRole", message.getSenderRole());
        response.put("content", message.getContent());
        response.put("timestamp", message.getTimestamp().format(fmt));
        return ResponseEntity.ok(response);
    }

    @GetMapping("/history")
    public ResponseEntity<List<Map<String, Object>>> getMeetingHistory(Authentication auth) {
        List<Meeting> meetings = meetingService.getMeetingHistory(auth.getName());
        DateTimeFormatter fmt = DateTimeFormatter.ofPattern("M/d/yyyy h:mm a");
        List<Map<String, Object>> result = meetings.stream().map(m -> {
            Map<String, Object> map = new HashMap<>();
            map.put("id", m.getId());
            map.put("startTime", m.getStartTime().format(fmt));
            map.put("endTime", m.getEndTime() != null ? m.getEndTime().format(fmt) : "In Progress");
            map.put("active", m.isActive());
            map.put("participantCount", m.getParticipants().size());
            return map;
        }).collect(Collectors.toList());
        return ResponseEntity.ok(result);
    }
}

