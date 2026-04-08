package com.school.MeetingsApp.service;

import com.school.MeetingsApp.dto.CreateStudentRequest;
import com.school.MeetingsApp.dto.StudentDTO;
import com.school.MeetingsApp.model.Student;
import com.school.MeetingsApp.model.Teacher;
import com.school.MeetingsApp.repository.StudentRepository;
import com.school.MeetingsApp.repository.TeacherRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class StudentService {

    private final StudentRepository studentRepository;
    private final TeacherRepository teacherRepository;
    private final PasswordEncoder passwordEncoder;

    public StudentService(StudentRepository studentRepository, TeacherRepository teacherRepository, PasswordEncoder passwordEncoder) {
        this.studentRepository = studentRepository;
        this.teacherRepository = teacherRepository;
        this.passwordEncoder = passwordEncoder;
    }

    public List<StudentDTO> getStudentsByTeacher(String teacherUsername) {
        Teacher teacher = teacherRepository.findByUsername(teacherUsername)
                .orElseThrow(() -> new RuntimeException("Teacher not found"));
        return studentRepository.findByTeacherOrderByCreatedAtDesc(teacher)
                .stream().map(StudentDTO::fromEntity).collect(Collectors.toList());
    }

    public List<StudentDTO> searchStudents(String teacherUsername, String query) {
        Teacher teacher = teacherRepository.findByUsername(teacherUsername)
                .orElseThrow(() -> new RuntimeException("Teacher not found"));
        return studentRepository.findByTeacherAndNameContainingIgnoreCaseOrderByCreatedAtDesc(teacher, query)
                .stream().map(StudentDTO::fromEntity).collect(Collectors.toList());
    }

    @Transactional
    public StudentDTO createStudent(String teacherUsername, CreateStudentRequest request) {
        Teacher teacher = teacherRepository.findByUsername(teacherUsername)
                .orElseThrow(() -> new RuntimeException("Teacher not found"));

        if (studentRepository.existsByUsername(request.getUsername())) {
            throw new RuntimeException("Username already exists");
        }

        Student student = new Student(
                request.getName(),
                request.getUsername(),
                passwordEncoder.encode(request.getPassword()),
                teacher
        );
        student.setDeviceLock(request.isDeviceLock());
        student.setShowRecordings(request.isShowRecordings());

        return StudentDTO.fromEntity(studentRepository.save(student));
    }

    @Transactional
    public StudentDTO updateStudent(Long id, CreateStudentRequest request) {
        Student student = studentRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Student not found"));

        student.setName(request.getName());
        if (request.getPassword() != null && !request.getPassword().isEmpty()) {
            student.setPassword(passwordEncoder.encode(request.getPassword()));
        }
        student.setDeviceLock(request.isDeviceLock());
        student.setShowRecordings(request.isShowRecordings());

        return StudentDTO.fromEntity(studentRepository.save(student));
    }

    @Transactional
    public void deleteStudent(Long id) {
        studentRepository.deleteById(id);
    }

    @Transactional
    public StudentDTO toggleBlock(Long id) {
        Student student = studentRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Student not found"));
        student.setBlocked(!student.isBlocked());
        return StudentDTO.fromEntity(studentRepository.save(student));
    }

    @Transactional
    public StudentDTO toggleMute(Long id) {
        Student student = studentRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Student not found"));
        student.setMuted(!student.isMuted());
        return StudentDTO.fromEntity(studentRepository.save(student));
    }

    @Transactional
    public void setOnline(Long id, boolean online) {
        Student student = studentRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Student not found"));
        student.setOnline(online);
        if (!online) {
            student.setLastSeen(LocalDateTime.now());
        }
        studentRepository.save(student);
    }
}

