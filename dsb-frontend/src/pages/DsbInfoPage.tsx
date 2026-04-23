import { useEffect, useMemo, useRef } from "react";
import { useTheme } from "../context/ThemeContext";
import infoHtml from "./dsb-info.html?raw";
import infoCss from "../styles/dsb-info.css?raw";

function extractBodyMarkup(): string {
    const parser = new DOMParser();
    const doc = parser.parseFromString(infoHtml, "text/html");
    doc.querySelectorAll("script").forEach((node) => node.remove());
    return doc.body.innerHTML;
}

export default function DsbInfoPage() {
    const { toggleTheme } = useTheme();
    const rootRef = useRef<HTMLDivElement>(null);
    const bodyMarkup = useMemo(() => extractBodyMarkup(), []);

    useEffect(() => {
        document.title = "Digital Scrum Board — System Guide";
    }, []);

    useEffect(() => {
        const root = rootRef.current;
        if (!root) return;

        const themeButton = root.querySelector<HTMLButtonElement>("#themeToggle");
        const proceedToLoginButton = root.querySelector<HTMLButtonElement>("#proceedToLogin");
        const handleThemeToggle = () => {
            toggleTheme();
            window.setTimeout(() => {
                window.location.reload();
            }, 0);
        };
        const handleProceedToLogin = () => {
            window.location.href = "/login";
        };
        themeButton?.addEventListener("click", handleThemeToggle);
        proceedToLoginButton?.addEventListener("click", handleProceedToLogin);

        const anchorHandlers = new Map<HTMLAnchorElement, EventListener>();
        root.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((anchor) => {
            const handler: EventListener = (event) => {
                const href = anchor.getAttribute("href");
                if (!href) return;
                const target = root.querySelector<HTMLElement>(href);
                if (!target) return;
                event.preventDefault();
                target.scrollIntoView({ behavior: "smooth", block: "start" });
            };
            anchor.addEventListener("click", handler);
            anchorHandlers.set(anchor, handler);
        });

        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                entry.target.classList.add("info-visible");
                observer.unobserve(entry.target);
            });
        }, { threshold: 0.08 });

        root.querySelectorAll(".info-card, .info-role-card, .info-module, .info-flow-card, .info-security-item, .info-realtime-card, .info-faq-item").forEach((el) => {
            observer.observe(el);
        });

        return () => {
            themeButton?.removeEventListener("click", handleThemeToggle);
            proceedToLoginButton?.removeEventListener("click", handleProceedToLogin);
            anchorHandlers.forEach((handler, anchor) => {
                anchor.removeEventListener("click", handler);
            });
            observer.disconnect();
        };
    }, [toggleTheme]);

    return (
        <>
            <style>{infoCss}</style>
            <div
                ref={rootRef}
                className="dsb-info-route"
                aria-label="Digital Scrum Board system guide"
                dangerouslySetInnerHTML={{ __html: bodyMarkup }}
            />
        </>
    );
}

