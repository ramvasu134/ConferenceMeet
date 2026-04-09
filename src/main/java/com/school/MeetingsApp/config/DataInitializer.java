package com.school.MeetingsApp.config;

import com.school.MeetingsApp.model.Teacher;
import com.school.MeetingsApp.model.Student;
import com.school.MeetingsApp.repository.TeacherRepository;
import com.school.MeetingsApp.repository.StudentRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.LocalDateTime;

@Configuration
public class DataInitializer {

    @Bean
    CommandLineRunner initData(TeacherRepository teacherRepo, StudentRepository studentRepo, PasswordEncoder encoder) {
        return args -> {
            // Fix any existing teachers that don't have a role set
            teacherRepo.findAll().forEach(t -> {
                if (t.getRole() == null || t.getRole().isEmpty()) {
                    t.setRole("MANAGER");
                    teacherRepo.save(t);
                }
            });

            // Ensure "admin" user is always ADMIN
            teacherRepo.findByUsername("admin").ifPresent(t -> {
                if (!"ADMIN".equals(t.getRole())) {
                    t.setRole("ADMIN");
                    teacherRepo.save(t);
                }
            });

            // Seed data only if admin doesn't exist yet
            if (!teacherRepo.existsByUsername("admin")) {
                // === ADMIN ===
                Teacher admin = new Teacher("Admin User", "admin", encoder.encode("admin123"), "ADMIN");
                admin.setAvatar("avatar-11"); // Dragon
                admin = teacherRepo.save(admin);

                // === MANAGER ===
                Teacher manager = new Teacher("Manager User", "manager", encoder.encode("manager123"), "MANAGER");
                manager.setAvatar("avatar-3"); // Lion
                manager = teacherRepo.save(manager);

                // === STUDENTS (under admin) ===
                String[][] adminStudents = {
                    {"Rahul Sharma", "rahul"},
                    {"Priya Patel", "priya"},
                    {"Amit Kumar", "amit"},
                };
                String[] adminAvatars = {"avatar-1", "avatar-4", "avatar-9"};
                for (int i = 0; i < adminStudents.length; i++) {
                    Student s = new Student(adminStudents[i][0], adminStudents[i][1], encoder.encode("student123"), admin);
                    s.setCreatedAt(LocalDateTime.now().minusDays((int)(Math.random() * 30)));
                    s.setLastSeen(LocalDateTime.now().minusHours((int)(Math.random() * 48)));
                    s.setShowRecordings(true);
                    s.setAvatar(adminAvatars[i]);
                    studentRepo.save(s);
                }

                // === STUDENTS (under manager) ===
                String[][] mgrStudents = {
                    {"Sneha Reddy", "sneha"},
                    {"Kiran Das", "kiran"},
                    {"Meera Joshi", "meera"},
                };
                String[] mgrAvatars = {"avatar-10", "avatar-7", "avatar-14"};
                for (int i = 0; i < mgrStudents.length; i++) {
                    Student s = new Student(mgrStudents[i][0], mgrStudents[i][1], encoder.encode("student123"), manager);
                    s.setCreatedAt(LocalDateTime.now().minusDays((int)(Math.random() * 30)));
                    s.setLastSeen(LocalDateTime.now().minusHours((int)(Math.random() * 48)));
                    s.setShowRecordings(true);
                    s.setAvatar(mgrAvatars[i]);
                    studentRepo.save(s);
                }

                // === THE "student" account for quick testing ===
                Student testStudent = new Student("Test Student", "student", encoder.encode("student123"), admin);
                testStudent.setCreatedAt(LocalDateTime.now());
                testStudent.setShowRecordings(true);
                testStudent.setAvatar("avatar-5"); // Panda
                studentRepo.save(testStudent);
            }
        };
    }
}
