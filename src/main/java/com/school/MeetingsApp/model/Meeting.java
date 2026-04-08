package com.school.MeetingsApp.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "meetings")
public class Meeting {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "teacher_id", nullable = false)
    private Teacher teacher;

    private LocalDateTime startTime;

    private LocalDateTime endTime;

    private boolean active = false;

    private boolean fullRecording = false;

    @ManyToMany
    @JoinTable(name = "meeting_students",
            joinColumns = @JoinColumn(name = "meeting_id"),
            inverseJoinColumns = @JoinColumn(name = "student_id"))
    private List<Student> participants = new ArrayList<>();

    public Meeting() {}

    public Meeting(Teacher teacher) {
        this.teacher = teacher;
        this.startTime = LocalDateTime.now();
        this.active = true;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Teacher getTeacher() { return teacher; }
    public void setTeacher(Teacher teacher) { this.teacher = teacher; }
    public LocalDateTime getStartTime() { return startTime; }
    public void setStartTime(LocalDateTime startTime) { this.startTime = startTime; }
    public LocalDateTime getEndTime() { return endTime; }
    public void setEndTime(LocalDateTime endTime) { this.endTime = endTime; }
    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }
    public boolean isFullRecording() { return fullRecording; }
    public void setFullRecording(boolean fullRecording) { this.fullRecording = fullRecording; }
    public List<Student> getParticipants() { return participants; }
    public void setParticipants(List<Student> participants) { this.participants = participants; }
}

