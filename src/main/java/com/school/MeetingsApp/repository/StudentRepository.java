package com.school.MeetingsApp.repository;

import com.school.MeetingsApp.model.Student;
import com.school.MeetingsApp.model.Teacher;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface StudentRepository extends JpaRepository<Student, Long> {
    List<Student> findByTeacherOrderByCreatedAtDesc(Teacher teacher);
    List<Student> findByTeacherAndNameContainingIgnoreCaseOrderByCreatedAtDesc(Teacher teacher, String name);
    Optional<Student> findByUsername(String username);
    boolean existsByUsername(String username);
}

