package com.school.MeetingsApp.repository;

import com.school.MeetingsApp.model.Meeting;
import com.school.MeetingsApp.model.Teacher;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface MeetingRepository extends JpaRepository<Meeting, Long> {
    Optional<Meeting> findByTeacherAndActiveTrue(Teacher teacher);
    List<Meeting> findByTeacherOrderByStartTimeDesc(Teacher teacher);
}

