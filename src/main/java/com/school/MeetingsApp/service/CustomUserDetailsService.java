package com.school.MeetingsApp.service;

import com.school.MeetingsApp.model.Teacher;
import com.school.MeetingsApp.repository.TeacherRepository;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

import java.util.Collections;

@Service
public class CustomUserDetailsService implements UserDetailsService {

    private final TeacherRepository teacherRepository;

    public CustomUserDetailsService(TeacherRepository teacherRepository) {
        this.teacherRepository = teacherRepository;
    }

    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        Teacher teacher = teacherRepository.findByUsername(username)
                .orElseThrow(() -> new UsernameNotFoundException("Teacher not found: " + username));

        return new User(
                teacher.getUsername(),
                teacher.getPassword(),
                Collections.singletonList(new SimpleGrantedAuthority("ROLE_TEACHER"))
        );
    }
}

