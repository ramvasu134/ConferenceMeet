package com.school.MeetingsApp;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

import java.io.File;

@SpringBootApplication
public class MeetingsAppApplication {

	public static void main(String[] args) {
		// Ensure H2 data directories exist BEFORE Spring context loads
		// This prevents the 500 error on Render.com and fresh deploys
		ensureDataDirectories();

		SpringApplication.run(MeetingsAppApplication.class, args);
	}

	private static void ensureDataDirectories() {
		// Local dev directory
		new File("./data").mkdirs();
		// Render.com container directory
		new File("/opt/data").mkdirs();
	}

}
