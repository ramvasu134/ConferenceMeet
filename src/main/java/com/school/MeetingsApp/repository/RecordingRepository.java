package com.school.MeetingsApp.repository;

import com.school.MeetingsApp.model.Recording;
import com.school.MeetingsApp.model.Teacher;
import com.school.MeetingsApp.model.Student;
import com.school.MeetingsApp.model.Meeting;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface RecordingRepository extends JpaRepository<Recording, Long> {
    List<Recording> findByTeacherOrderByCreatedAtDesc(Teacher teacher);
    List<Recording> findByStudentOrderByCreatedAtDesc(Student student);
    List<Recording> findByMeetingOrderByCreatedAtDesc(Meeting meeting);
}

