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
            if (!teacherRepo.existsByUsername("vk99")) {
                Teacher teacher = new Teacher("VK2", "vk99", encoder.encode("123456"));
                teacher = teacherRepo.save(teacher);

                // Create some sample students
                String[][] students = {
                    {"PEDDA", "PEDDA"},
                    {"55", "55"},
                    {"RAMESH", "RAMESH"},
                    {"22", "22L"},
                    {"NO8", "NO8"},
                    {"1", "NO1"}
                };

                for (String[] s : students) {
                    Student student = new Student(s[0], s[1], encoder.encode("student123"), teacher);
                    student.setCreatedAt(LocalDateTime.now().minusDays((int)(Math.random() * 30)));
                    student.setLastSeen(LocalDateTime.now().minusHours((int)(Math.random() * 48)));
                    student.setShowRecordings(true);
                    studentRepo.save(student);
                }
            }
        };
    }
}

