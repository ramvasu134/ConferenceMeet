package com.school.MeetingsApp.config;

import com.school.MeetingsApp.model.Student;
import com.school.MeetingsApp.repository.StudentRepository;
import com.school.MeetingsApp.service.BroadcastService;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.util.Set;

@Component
public class RoleBasedSuccessHandler implements AuthenticationSuccessHandler {

    private final StudentRepository studentRepository;
    private final BroadcastService broadcastService;

    public RoleBasedSuccessHandler(StudentRepository studentRepository, BroadcastService broadcastService) {
        this.studentRepository = studentRepository;
        this.broadcastService = broadcastService;
    }

    @Override
    @Transactional
    public void onAuthenticationSuccess(HttpServletRequest request, HttpServletResponse response,
                                         Authentication authentication) throws IOException, ServletException {
        Set<String> roles = AuthorityUtils.authorityListToSet(authentication.getAuthorities());

        if (roles.contains("ROLE_STUDENT")) {
            // Set student session attributes for the student dashboard
            String username = authentication.getName();
            studentRepository.findByUsernameWithTeacher(username).ifPresent(s -> {
                HttpSession session = request.getSession();
                session.setAttribute("studentId", s.getId());
                session.setAttribute("studentName", s.getName());
                session.setAttribute("studentUsername", s.getUsername());
                session.setAttribute("teacherName", s.getTeacher().getName());
                session.setAttribute("teacherId", s.getTeacher().getId());
                session.setAttribute("studentAvatar", s.getAvatar() != null ? s.getAvatar() : "avatar-1");
                broadcastService.markStudentOnline(s.getId());
            });
            response.sendRedirect("/student/dashboard");
        } else {
            // Admin or Manager → teacher dashboard
            response.sendRedirect("/dashboard");
        }
    }
}
