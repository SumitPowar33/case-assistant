package in.caseassistant;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Map;
import java.util.UUID;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.HandlerMapping;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Reading anything under /api/firs/{firId}/ (not the FIR itself, see FirController) needs the case team;
 * evidence also lets the station's malkhana staff in. Anyone else gets 404, so a case reveals nothing.
 */
@Component
class ReadAccess implements HandlerInterceptor, WebMvcConfigurer {
    private final CaseTeam team;

    ReadAccess(CaseTeam team) {
        this.team = team;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(this).addPathPatterns("/api/firs/{firId}/**");
    }

    @Override
    @SuppressWarnings("unchecked")
    public boolean preHandle(HttpServletRequest req, HttpServletResponse res, Object handler) throws Exception {
        if (!"GET".equals(req.getMethod())) return true;
        var vars = (Map<String, String>) req.getAttribute(HandlerMapping.URI_TEMPLATE_VARIABLES_ATTRIBUTE);
        // only sub-resources: the FIR itself (/api/firs/{id}) is checked in FirController. The id is named firId or id
        // depending on the controller.
        if (!req.getRequestURI().matches("/api/firs/[^/]+/.+")) return true;
        String id = vars == null ? null : vars.getOrDefault("firId", vars.get("id"));
        if (id == null) return true;
        UUID me = SecurityContextHolder.getContext().getAuthentication().getPrincipal() instanceof Jwt jwt ? CaseTeam.user(jwt) : null;
        UUID fir = UUID.fromString(id);
        boolean evidence = req.getRequestURI().contains("/evidence");
        if (evidence ? team.isCustodian(me, fir) : team.includes(me, fir)) return true;
        res.sendError(HttpServletResponse.SC_NOT_FOUND);
        return false;
    }
}
