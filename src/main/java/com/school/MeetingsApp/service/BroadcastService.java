package com.school.MeetingsApp.service;

import com.school.MeetingsApp.model.*;
import com.school.MeetingsApp.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Service
public class BroadcastService {

    private final BroadcastChunkRepository chunkRepo;
    private final DoubtClipRepository doubtRepo;
    private final MeetingRepository meetingRepo;
    private final StudentRepository studentRepo;
    private final TeacherRepository teacherRepo;

    public BroadcastService(BroadcastChunkRepository chunkRepo, DoubtClipRepository doubtRepo,
                            MeetingRepository meetingRepo, StudentRepository studentRepo,
                            TeacherRepository teacherRepo) {
        this.chunkRepo = chunkRepo;
        this.doubtRepo = doubtRepo;
        this.meetingRepo = meetingRepo;
        this.studentRepo = studentRepo;
        this.teacherRepo = teacherRepo;
    }

    // ====== BROADCAST CHUNKS (Teacher → Students) ======

    @Transactional
    public BroadcastChunk saveBroadcastChunk(Long meetingId, byte[] audioData) {
        Meeting meeting = meetingRepo.findById(meetingId)
                .orElseThrow(() -> new RuntimeException("Meeting not found"));

        int nextIndex = chunkRepo.findTopByMeetingOrderByChunkIndexDesc(meeting)
                .map(c -> c.getChunkIndex() + 1).orElse(0);

        BroadcastChunk chunk = new BroadcastChunk();
        chunk.setMeeting(meeting);
        chunk.setChunkIndex(nextIndex);
        chunk.setAudioData(audioData);
        chunk.setFileSize(audioData.length);
        return chunkRepo.save(chunk);
    }

    public List<BroadcastChunk> getChunksAfter(Long meetingId, int afterIndex) {
        Meeting meeting = meetingRepo.findById(meetingId)
                .orElseThrow(() -> new RuntimeException("Meeting not found"));
        return chunkRepo.findByMeetingAndChunkIndexGreaterThanOrderByChunkIndexAsc(meeting, afterIndex);
    }

    public Optional<BroadcastChunk> getChunk(Long chunkId) {
        return chunkRepo.findById(chunkId);
    }

    // ====== DOUBT CLIPS (Student → Teacher & Student) ======

    @Transactional
    public DoubtClip saveDoubtClip(Long meetingId, Long studentId, byte[] audioData, long duration) {
        Student student = studentRepo.findById(studentId)
                .orElseThrow(() -> new RuntimeException("Student not found"));
        Teacher teacher = student.getTeacher();

        DoubtClip clip = new DoubtClip();
        clip.setStudent(student);
        clip.setTeacher(teacher);
        clip.setAudioData(audioData);
        clip.setFileName("doubt_" + student.getUsername() + "_" + System.currentTimeMillis() + ".webm");
        clip.setFileSize(audioData.length);
        clip.setDurationSeconds(duration);

        if (meetingId != null) {
            meetingRepo.findById(meetingId).ifPresent(clip::setMeeting);
        }
        return doubtRepo.save(clip);
    }

    public List<DoubtClip> getDoubtsByMeeting(Long meetingId) {
        Meeting meeting = meetingRepo.findById(meetingId)
                .orElseThrow(() -> new RuntimeException("Meeting not found"));
        return doubtRepo.findByMeetingOrderByCreatedAtDesc(meeting);
    }

    public List<DoubtClip> getDoubtsByStudent(Long studentId) {
        Student student = studentRepo.findById(studentId)
                .orElseThrow(() -> new RuntimeException("Student not found"));
        return doubtRepo.findByStudentOrderByCreatedAtDesc(student);
    }

    public List<DoubtClip> getUnansweredDoubts(String teacherUsername) {
        Teacher teacher = teacherRepo.findByUsername(teacherUsername)
                .orElseThrow(() -> new RuntimeException("Teacher not found"));
        return doubtRepo.findByTeacherAndAnsweredFalseOrderByCreatedAtDesc(teacher);
    }

    public List<DoubtClip> getAllDoubtsByTeacher(String teacherUsername) {
        Teacher teacher = teacherRepo.findByUsername(teacherUsername)
                .orElseThrow(() -> new RuntimeException("Teacher not found"));
        return doubtRepo.findByTeacherOrderByCreatedAtDesc(teacher);
    }

    public Optional<DoubtClip> getDoubtClip(Long id) {
        return doubtRepo.findById(id);
    }

    @Transactional
    public DoubtClip answerDoubt(Long doubtId, String note, byte[] answerAudio) {
        DoubtClip clip = doubtRepo.findById(doubtId)
                .orElseThrow(() -> new RuntimeException("Doubt not found"));
        clip.setAnswered(true);
        clip.setAnsweredAt(LocalDateTime.now());
        if (note != null) clip.setAnswerNote(note);
        if (answerAudio != null) clip.setAnswerAudioData(answerAudio);
        return doubtRepo.save(clip);
    }

    // ====== STUDENT SESSION ======

    public Optional<Student> authenticateStudent(String username, String password) {
        return studentRepo.findByUsername(username)
                .filter(s -> {
                    // Password is BCrypt encoded
                    org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder enc =
                            new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder();
                    return enc.matches(password, s.getPassword());
                })
                .filter(s -> !s.isBlocked());
    }

    @Transactional
    public void markStudentOnline(Long studentId) {
        studentRepo.findById(studentId).ifPresent(s -> {
            s.setOnline(true);
            studentRepo.save(s);
        });
    }

    @Transactional
    public void markStudentOffline(Long studentId) {
        studentRepo.findById(studentId).ifPresent(s -> {
            s.setOnline(false);
            s.setLastSeen(LocalDateTime.now());
            studentRepo.save(s);
        });
    }
}

