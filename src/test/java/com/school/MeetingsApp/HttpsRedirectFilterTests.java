package com.school.MeetingsApp;

import com.school.MeetingsApp.config.HttpsRedirectFilter;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.junit.jupiter.api.Assertions.*;

/**
 * HTTPS REDIRECT FILTER TESTS — Validates the HTTP→HTTPS redirect
 * works correctly behind Render's reverse proxy and doesn't break local dev.
 */
class HttpsRedirectFilterTests {

    private final HttpsRedirectFilter filter = new HttpsRedirectFilter();

    @Test
    @DisplayName("HTTPS: Redirect HTTP to HTTPS when X-Forwarded-Proto is http")
    void redirectsHttpToHttps() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/dashboard");
        request.setServerName("mtng-app.onrender.com");
        request.addHeader("X-Forwarded-Proto", "http");

        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertEquals(301, response.getStatus(), "Should return 301 Moved Permanently");
        assertEquals("https://mtng-app.onrender.com/dashboard", response.getHeader("Location"));
    }

    @Test
    @DisplayName("HTTPS: Redirect preserves query string")
    void redirectPreservesQueryString() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/student/login");
        request.setServerName("mtng-app.onrender.com");
        request.addHeader("X-Forwarded-Proto", "http");
        request.setQueryString("error=true");

        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertEquals(301, response.getStatus());
        assertEquals("https://mtng-app.onrender.com/student/login?error=true",
                response.getHeader("Location"),
                "Query string must be preserved in redirect");
    }

    @Test
    @DisplayName("HTTPS: No redirect when already HTTPS (X-Forwarded-Proto: https)")
    void noRedirectWhenAlreadyHttps() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/dashboard");
        request.setServerName("mtng-app.onrender.com");
        request.addHeader("X-Forwarded-Proto", "https");

        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertEquals(200, response.getStatus(), "Should pass through without redirect");
        assertNull(response.getHeader("Location"), "No Location header when already HTTPS");
    }

    @Test
    @DisplayName("HTTPS: No redirect on local dev (no X-Forwarded-Proto header)")
    void noRedirectOnLocalDev() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/dashboard");
        request.setServerName("localhost");
        // No X-Forwarded-Proto header

        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertEquals(200, response.getStatus(), "Local dev should not be redirected");
        assertNull(response.getHeader("Location"));
    }

    @Test
    @DisplayName("HTTPS: Redirect works for API endpoints too")
    void redirectWorksForApiEndpoints() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/student/login");
        request.setServerName("mtng-app.onrender.com");
        request.addHeader("X-Forwarded-Proto", "http");

        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertEquals(301, response.getStatus());
        assertEquals("https://mtng-app.onrender.com/api/student/login",
                response.getHeader("Location"));
    }

    @Test
    @DisplayName("HTTPS: Redirect works for student portal pages")
    void redirectWorksForStudentPortal() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/student/dashboard");
        request.setServerName("mtng-app.onrender.com");
        request.addHeader("X-Forwarded-Proto", "http");

        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertEquals(301, response.getStatus());
        assertEquals("https://mtng-app.onrender.com/student/dashboard",
                response.getHeader("Location"));
    }
}

