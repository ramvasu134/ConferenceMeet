package com.school.MeetingsApp.repository;

import com.school.MeetingsApp.model.ChatMessage;
import com.school.MeetingsApp.model.Meeting;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface ChatMessageRepository extends JpaRepository<ChatMessage, Long> {
    List<ChatMessage> findByMeetingOrderByTimestampAsc(Meeting meeting);
}

