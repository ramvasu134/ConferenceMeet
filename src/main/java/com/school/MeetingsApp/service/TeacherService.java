package com.school.MeetingsApp.service;

import com.school.MeetingsApp.model.Teacher;
import com.school.MeetingsApp.repository.TeacherRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TeacherService {

    private final TeacherRepository teacherRepository;
    private final PasswordEncoder passwordEncoder;

    public TeacherService(TeacherRepository teacherRepository, PasswordEncoder passwordEncoder) {
        this.teacherRepository = teacherRepository;
        this.passwordEncoder = passwordEncoder;
    }

    public Teacher getByUsername(String username) {
        return teacherRepository.findByUsername(username)
                .orElseThrow(() -> new RuntimeException("Teacher not found"));
    }

    @Transactional
    public void changePassword(String username, String oldPassword, String newPassword) {
        Teacher teacher = getByUsername(username);
        if (!passwordEncoder.matches(oldPassword, teacher.getPassword())) {
            throw new RuntimeException("Current password is incorrect");
        }
        teacher.setPassword(passwordEncoder.encode(newPassword));
        teacherRepository.save(teacher);
    }

    @Transactional
    public void updateSettings(String username, String theme, String speakDetectionType, boolean fullMeetingRecording) {
        Teacher teacher = getByUsername(username);
        teacher.setTheme(theme);
        teacher.setSpeakDetectionType(speakDetectionType);
        teacher.setFullMeetingRecording(fullMeetingRecording);
        teacherRepository.save(teacher);
    }

    @Transactional
    public void toggleFullMeetingRecording(String username) {
        Teacher teacher = getByUsername(username);
        teacher.setFullMeetingRecording(!teacher.isFullMeetingRecording());
        teacherRepository.save(teacher);
    }
}

