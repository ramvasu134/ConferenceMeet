package com.school.MeetingsApp.dto;

public class CreateStudentRequest {
    private String name;
    private String username;
    private String password;
    private boolean deviceLock;
    private boolean showRecordings = true;

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }
    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }
    public boolean isDeviceLock() { return deviceLock; }
    public void setDeviceLock(boolean deviceLock) { this.deviceLock = deviceLock; }
    public boolean isShowRecordings() { return showRecordings; }
    public void setShowRecordings(boolean showRecordings) { this.showRecordings = showRecordings; }
}

