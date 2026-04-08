package com.school.MeetingsApp.service;

import com.school.MeetingsApp.model.*;
import com.school.MeetingsApp.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Service
public class MeetingService {

    private final MeetingRepository meetingRepository;
    private final TeacherRepository teacherRepository;
    private final ChatMessageRepository chatMessageRepository;
    private final RecordingRepository recordingRepository;

    public MeetingService(MeetingRepository meetingRepository, TeacherRepository teacherRepository,
                          ChatMessageRepository chatMessageRepository, RecordingRepository recordingRepository) {
        this.meetingRepository = meetingRepository;
        this.teacherRepository = teacherRepository;
        this.chatMessageRepository = chatMessageRepository;
        this.recordingRepository = recordingRepository;
    }

    @Transactional
    public Meeting startMeeting(String teacherUsername) {
        Teacher teacher = teacherRepository.findByUsername(teacherUsername)
                .orElseThrow(() -> new RuntimeException("Teacher not found"));

        // End any existing active meeting
        Optional<Meeting> existing = meetingRepository.findByTeacherAndActiveTrue(teacher);
        existing.ifPresent(m -> {
            m.setActive(false);
            m.setEndTime(LocalDateTime.now());
            meetingRepository.save(m);
        });

        Meeting meeting = new Meeting(teacher);
        meeting.setFullRecording(teacher.isFullMeetingRecording());
        return meetingRepository.save(meeting);
    }

    @Transactional
    public Meeting endMeeting(String teacherUsername) {
        Teacher teacher = teacherRepository.findByUsername(teacherUsername)
                .orElseThrow(() -> new RuntimeException("Teacher not found"));

        Meeting meeting = meetingRepository.findByTeacherAndActiveTrue(teacher)
                .orElseThrow(() -> new RuntimeException("No active meeting"));

        meeting.setActive(false);
        meeting.setEndTime(LocalDateTime.now());
        return meetingRepository.save(meeting);
    }

    public Optional<Meeting> getActiveMeeting(String teacherUsername) {
        Teacher teacher = teacherRepository.findByUsername(teacherUsername)
                .orElseThrow(() -> new RuntimeException("Teacher not found"));
        return meetingRepository.findByTeacherAndActiveTrue(teacher);
    }

    public List<Meeting> getMeetingHistory(String teacherUsername) {
        Teacher teacher = teacherRepository.findByUsername(teacherUsername)
                .orElseThrow(() -> new RuntimeException("Teacher not found"));
        return meetingRepository.findByTeacherOrderByStartTimeDesc(teacher);
    }

    @Transactional
    public ChatMessage addChatMessage(Long meetingId, String senderName, String senderRole, String content) {
        Meeting meeting = meetingRepository.findById(meetingId)
                .orElseThrow(() -> new RuntimeException("Meeting not found"));
        ChatMessage message = new ChatMessage(meeting, senderName, senderRole, content);
        return chatMessageRepository.save(message);
    }

    public List<ChatMessage> getChatMessages(Long meetingId) {
        Meeting meeting = meetingRepository.findById(meetingId)
                .orElseThrow(() -> new RuntimeException("Meeting not found"));
        return chatMessageRepository.findByMeetingOrderByTimestampAsc(meeting);
    }

    @Transactional
    public Recording saveRecording(Long meetingId, Long studentId, String teacherUsername, byte[] audioData,
                                    String fileName, long duration) {
        Teacher teacher = teacherRepository.findByUsername(teacherUsername)
                .orElseThrow(() -> new RuntimeException("Teacher not found"));

        Recording recording = new Recording();
        recording.setTeacher(teacher);
        recording.setAudioData(audioData);
        recording.setFileName(fileName);
        recording.setDurationSeconds(duration);
        recording.setFileSize(audioData.length);

        if (meetingId != null) {
            meetingRepository.findById(meetingId).ifPresent(recording::setMeeting);
        }

        return recordingRepository.save(recording);
    }

    public List<Recording> getRecordings(String teacherUsername) {
        Teacher teacher = teacherRepository.findByUsername(teacherUsername)
                .orElseThrow(() -> new RuntimeException("Teacher not found"));
        return recordingRepository.findByTeacherOrderByCreatedAtDesc(teacher);
    }

    public Optional<Recording> getRecording(Long id) {
        return recordingRepository.findById(id);
    }

    @Transactional
    public void deleteRecording(Long id) {
        recordingRepository.deleteById(id);
    }
}

