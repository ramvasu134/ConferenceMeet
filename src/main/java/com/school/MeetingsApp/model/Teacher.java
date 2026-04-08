package com.school.MeetingsApp.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "teachers")
public class Teacher {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false, unique = true)
    private String username;

    @Column(nullable = false)
    private String password;

    private LocalDateTime createdAt = LocalDateTime.now();

    private boolean fullMeetingRecording = false;

    private String theme = "dark";

    private String speakDetectionType = "auto";

    public Teacher() {}

    public Teacher(String name, String username, String password) {
        this.name = name;
        this.username = username;
        this.password = password;
        this.createdAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }
    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public boolean isFullMeetingRecording() { return fullMeetingRecording; }
    public void setFullMeetingRecording(boolean fullMeetingRecording) { this.fullMeetingRecording = fullMeetingRecording; }
    public String getTheme() { return theme; }
    public void setTheme(String theme) { this.theme = theme; }
    public String getSpeakDetectionType() { return speakDetectionType; }
    public void setSpeakDetectionType(String speakDetectionType) { this.speakDetectionType = speakDetectionType; }
}

