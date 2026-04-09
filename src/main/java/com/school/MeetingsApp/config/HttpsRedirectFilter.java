package com.school.MeetingsApp.config;

import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.io.IOException;

/**
 * Redirects HTTP → HTTPS in production (behind Render's reverse proxy).
 * The X-Forwarded-Proto header tells us the original client protocol.
 * On local dev (no proxy), the header is absent so no redirect happens.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class HttpsRedirectFilter implements Filter {


    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {

        HttpServletRequest httpReq = (HttpServletRequest) request;
        HttpServletResponse httpRes = (HttpServletResponse) response;

        String forwardedProto = httpReq.getHeader("X-Forwarded-Proto");

        // Only redirect if behind a proxy and the original request was HTTP
        if (forwardedProto != null && forwardedProto.equalsIgnoreCase("http")) {
            String redirectUrl = "https://" + httpReq.getServerName() + httpReq.getRequestURI();
            String queryString = httpReq.getQueryString();
            if (queryString != null) {
                redirectUrl += "?" + queryString;
            }
            httpRes.setStatus(HttpServletResponse.SC_MOVED_PERMANENTLY);
            httpRes.setHeader("Location", redirectUrl);
            return;
        }

        chain.doFilter(request, response);
    }
}

