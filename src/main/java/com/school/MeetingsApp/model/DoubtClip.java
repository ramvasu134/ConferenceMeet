package com.school.MeetingsApp.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "doubt_clips")
public class DoubtClip {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "meeting_id")
    private Meeting meeting;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "student_id", nullable = false)
    private Student student;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "teacher_id", nullable = false)
    private Teacher teacher;

    @Lob
    @Column(columnDefinition = "BLOB")
    private byte[] audioData;

    private String fileName;
    private long fileSize;
    private long durationSeconds;

    private boolean answered = false;
    private String answerNote;

    @Lob
    @Column(columnDefinition = "BLOB")
    private byte[] answerAudioData;

    private LocalDateTime createdAt = LocalDateTime.now();
    private LocalDateTime answeredAt;

    public DoubtClip() {}

    // Getters and setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Meeting getMeeting() { return meeting; }
    public void setMeeting(Meeting meeting) { this.meeting = meeting; }
    public Student getStudent() { return student; }
    public void setStudent(Student student) { this.student = student; }
    public Teacher getTeacher() { return teacher; }
    public void setTeacher(Teacher teacher) { this.teacher = teacher; }
    public byte[] getAudioData() { return audioData; }
    public void setAudioData(byte[] audioData) { this.audioData = audioData; }
    public String getFileName() { return fileName; }
    public void setFileName(String fileName) { this.fileName = fileName; }
    public long getFileSize() { return fileSize; }
    public void setFileSize(long fileSize) { this.fileSize = fileSize; }
    public long getDurationSeconds() { return durationSeconds; }
    public void setDurationSeconds(long durationSeconds) { this.durationSeconds = durationSeconds; }
    public boolean isAnswered() { return answered; }
    public void setAnswered(boolean answered) { this.answered = answered; }
    public String getAnswerNote() { return answerNote; }
    public void setAnswerNote(String answerNote) { this.answerNote = answerNote; }
    public byte[] getAnswerAudioData() { return answerAudioData; }
    public void setAnswerAudioData(byte[] answerAudioData) { this.answerAudioData = answerAudioData; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getAnsweredAt() { return answeredAt; }
    public void setAnsweredAt(LocalDateTime answeredAt) { this.answeredAt = answeredAt; }
}

