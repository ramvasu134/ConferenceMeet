package com.school.MeetingsApp.controller;

import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.SendTo;
import org.springframework.stereotype.Controller;

import java.util.Map;

@Controller
public class WebSocketController {

    @MessageMapping("/meeting.join")
    @SendTo("/topic/meeting")
    public Map<String, Object> joinMeeting(Map<String, Object> message) {
        message.put("type", "JOIN");
        return message;
    }

    @MessageMapping("/meeting.leave")
    @SendTo("/topic/meeting")
    public Map<String, Object> leaveMeeting(Map<String, Object> message) {
        message.put("type", "LEAVE");
        return message;
    }

    @MessageMapping("/meeting.audio")
    @SendTo("/topic/audio")
    public Map<String, Object> sendAudio(Map<String, Object> message) {
        message.put("type", "AUDIO");
        return message;
    }

    @MessageMapping("/meeting.chat")
    @SendTo("/topic/chat")
    public Map<String, Object> chatMessage(Map<String, Object> message) {
        message.put("type", "CHAT");
        return message;
    }

    @MessageMapping("/meeting.mute")
    @SendTo("/topic/meeting")
    public Map<String, Object> muteStudent(Map<String, Object> message) {
        message.put("type", "MUTE");
        return message;
    }
}

