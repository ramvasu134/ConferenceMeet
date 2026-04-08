package com.school.MeetingsApp.repository;

import com.school.MeetingsApp.model.DoubtClip;
import com.school.MeetingsApp.model.Meeting;
import com.school.MeetingsApp.model.Student;
import com.school.MeetingsApp.model.Teacher;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface DoubtClipRepository extends JpaRepository<DoubtClip, Long> {
    List<DoubtClip> findByMeetingOrderByCreatedAtDesc(Meeting meeting);
    List<DoubtClip> findByStudentOrderByCreatedAtDesc(Student student);
    List<DoubtClip> findByTeacherOrderByCreatedAtDesc(Teacher teacher);
    List<DoubtClip> findByTeacherAndAnsweredFalseOrderByCreatedAtDesc(Teacher teacher);
    List<DoubtClip> findByMeetingIdAndCreatedAtAfterOrderByCreatedAtAsc(Long meetingId, java.time.LocalDateTime after);
}

