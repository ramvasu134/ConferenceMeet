package com.school.MeetingsApp.service;

import com.school.MeetingsApp.model.Student;
import com.school.MeetingsApp.model.Teacher;
import com.school.MeetingsApp.repository.StudentRepository;
import com.school.MeetingsApp.repository.TeacherRepository;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.Optional;

@Service
public class CustomUserDetailsService implements UserDetailsService {

    private final TeacherRepository teacherRepository;
    private final StudentRepository studentRepository;

    public CustomUserDetailsService(TeacherRepository teacherRepository, StudentRepository studentRepository) {
        this.teacherRepository = teacherRepository;
        this.studentRepository = studentRepository;
    }

    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        // First try teacher (admin/manager)
        Optional<Teacher> teacher = teacherRepository.findByUsername(username);
        if (teacher.isPresent()) {
            Teacher t = teacher.get();
            String role = t.getRole() != null ? t.getRole() : "MANAGER";
            return new User(
                    t.getUsername(),
                    t.getPassword(),
                    Collections.singletonList(new SimpleGrantedAuthority("ROLE_" + role))
            );
        }

        // Then try student
        Optional<Student> student = studentRepository.findByUsername(username);
        if (student.isPresent()) {
            Student s = student.get();
            if (s.isBlocked()) {
                throw new UsernameNotFoundException("Account is blocked: " + username);
            }
            return new User(
                    s.getUsername(),
                    s.getPassword(),
                    Collections.singletonList(new SimpleGrantedAuthority("ROLE_STUDENT"))
            );
        }

        throw new UsernameNotFoundException("User not found: " + username);
    }
}
