package com.school.MeetingsApp.dto;

import com.school.MeetingsApp.model.Student;
import java.time.format.DateTimeFormatter;

public class StudentDTO {
    private Long id;
    private String name;
    private String username;
    private boolean deviceLock;
    private boolean showRecordings;
    private boolean blocked;
    private boolean muted;
    private boolean online;
    private String createdAt;
    private String lastSeen;

    public static StudentDTO fromEntity(Student s) {
        StudentDTO dto = new StudentDTO();
        DateTimeFormatter fmt = DateTimeFormatter.ofPattern("M/d/yyyy");
        DateTimeFormatter fmtTime = DateTimeFormatter.ofPattern("M/d/yyyy, h:mm:ss a");
        dto.id = s.getId();
        dto.name = s.getName();
        dto.username = s.getUsername();
        dto.deviceLock = s.isDeviceLock();
        dto.showRecordings = s.isShowRecordings();
        dto.blocked = s.isBlocked();
        dto.muted = s.isMuted();
        dto.online = s.isOnline();
        dto.createdAt = s.getCreatedAt() != null ? s.getCreatedAt().format(fmt) : "";
        dto.lastSeen = s.getLastSeen() != null ? s.getLastSeen().format(fmtTime) : "Never";
        return dto;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }
    public boolean isDeviceLock() { return deviceLock; }
    public void setDeviceLock(boolean deviceLock) { this.deviceLock = deviceLock; }
    public boolean isShowRecordings() { return showRecordings; }
    public void setShowRecordings(boolean showRecordings) { this.showRecordings = showRecordings; }
    public boolean isBlocked() { return blocked; }
    public void setBlocked(boolean blocked) { this.blocked = blocked; }
    public boolean isMuted() { return muted; }
    public void setMuted(boolean muted) { this.muted = muted; }
    public boolean isOnline() { return online; }
    public void setOnline(boolean online) { this.online = online; }
    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
    public String getLastSeen() { return lastSeen; }
    public void setLastSeen(String lastSeen) { this.lastSeen = lastSeen; }
}

