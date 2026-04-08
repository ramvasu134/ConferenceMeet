package com.school.MeetingsApp.repository;

import com.school.MeetingsApp.model.BroadcastChunk;
import com.school.MeetingsApp.model.Meeting;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface BroadcastChunkRepository extends JpaRepository<BroadcastChunk, Long> {
    List<BroadcastChunk> findByMeetingOrderByChunkIndexAsc(Meeting meeting);
    Optional<BroadcastChunk> findTopByMeetingOrderByChunkIndexDesc(Meeting meeting);
    List<BroadcastChunk> findByMeetingAndChunkIndexGreaterThanOrderByChunkIndexAsc(Meeting meeting, int afterIndex);
    void deleteByMeeting(Meeting meeting);
}

