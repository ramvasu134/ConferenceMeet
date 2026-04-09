package com.school.MeetingsApp.service;

import com.school.MeetingsApp.model.Teacher;
import com.school.MeetingsApp.repository.TeacherRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

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
                .orElseThrow(() -> new RuntimeException("User not found"));
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

    @Transactional
    public void updateAvatar(String username, String avatar) {
        Teacher teacher = getByUsername(username);
        teacher.setAvatar(avatar);
        teacherRepository.save(teacher);
    }

    // ====== MANAGER MANAGEMENT (Admin only) ======

    public List<Teacher> getManagers() {
        return teacherRepository.findByRoleOrderByCreatedAtDesc("MANAGER");
    }

    @Transactional
    public Teacher createManager(String name, String username, String password) {
        if (teacherRepository.existsByUsername(username)) {
            throw new RuntimeException("Username already exists");
        }
        Teacher manager = new Teacher(name, username, passwordEncoder.encode(password), "MANAGER");
        return teacherRepository.save(manager);
    }

    @Transactional
    public Teacher updateManager(Long id, String name, String password) {
        Teacher manager = teacherRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Manager not found"));
        if (!"MANAGER".equals(manager.getRole())) {
            throw new RuntimeException("Cannot edit non-manager users");
        }
        manager.setName(name);
        if (password != null && !password.isEmpty()) {
            manager.setPassword(passwordEncoder.encode(password));
        }
        return teacherRepository.save(manager);
    }

    @Transactional
    public void deleteManager(Long id) {
        Teacher manager = teacherRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Manager not found"));
        if (!"MANAGER".equals(manager.getRole())) {
            throw new RuntimeException("Cannot delete non-manager users");
        }
        teacherRepository.deleteById(id);
    }
}

