package com.school.MeetingsApp.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.io.File;

/**
 * Logs H2 database directory status on startup.
 * The actual directory creation happens in MeetingsAppApplication.main()
 * (before Spring context loads) to prevent 500 errors on Render.com.
 */
@Component
@Order(1)
public class DatabaseDirectoryInitializer implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DatabaseDirectoryInitializer.class);

    @Value("${spring.datasource.url}")
    private String datasourceUrl;

    @Value("${spring.profiles.active:default}")
    private String activeProfile;

    @Override
    public void run(ApplicationArguments args) {
        log.info("═══════════════════════════════════════════════");
        log.info("  Air MeetingsApp — Starting up");
        log.info("  Active Profile : {}", activeProfile);
        log.info("  Datasource URL : {}", maskUrl(datasourceUrl));
        log.info("═══════════════════════════════════════════════");

        if (datasourceUrl != null && datasourceUrl.contains("file:")) {
            String path = datasourceUrl.replace("jdbc:h2:file:", "").split(";")[0];
            File parentDir = new File(path).getParentFile();
            if (parentDir != null) {
                log.info("  H2 Data Dir    : {} (exists={})", parentDir.getAbsolutePath(), parentDir.exists());
            }
        } else if (datasourceUrl != null && datasourceUrl.contains("mem:")) {
            log.info("  H2 Mode        : In-Memory");
        }
    }

    private String maskUrl(String url) {
        if (url == null) return "null";
        // Don't log full path, just the type
        if (url.contains("file:")) return "jdbc:h2:file:***";
        if (url.contains("mem:")) return "jdbc:h2:mem:***";
        return "***";
    }
}
