package com.school.MeetingsApp.controller;

import com.school.MeetingsApp.model.Teacher;
import com.school.MeetingsApp.service.TeacherService;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class PageController {

    private final TeacherService teacherService;

    public PageController(TeacherService teacherService) {
        this.teacherService = teacherService;
    }

    @GetMapping("/login")
    public String loginPage() {
        return "login";
    }

    @GetMapping({"/", "/dashboard"})
    public String dashboard(Authentication auth, Model model) {
        Teacher teacher = teacherService.getByUsername(auth.getName());
        model.addAttribute("teacher", teacher);
        return "dashboard";
    }
}

