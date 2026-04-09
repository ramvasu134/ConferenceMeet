package com.school.MeetingsApp.repository;

import com.school.MeetingsApp.model.Teacher;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface TeacherRepository extends JpaRepository<Teacher, Long> {
    Optional<Teacher> findByUsername(String username);
    boolean existsByUsername(String username);
    List<Teacher> findByRoleOrderByCreatedAtDesc(String role);
}

