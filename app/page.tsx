"use client";

import { useRouter } from "next/navigation";
import { GraduationCap, Shield, ArrowRight, BookOpen } from "lucide-react";

export default function LandingPage() {
  const router = useRouter();

  return (
    <main className="min-h-screen grid-pattern flex flex-col items-center justify-center px-4 relative overflow-hidden">
      {/* Ambient glow blobs */}
      <div
        className="absolute top-[-20%] left-[-10%] w-150 h-150 rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, rgba(245,158,11,0.06) 0%, transparent 70%)",
        }}
      />
      <div
        className="absolute bottom-[-20%] right-[-10%] w-125 h-125 rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, rgba(34,211,238,0.05) 0%, transparent 70%)",
        }}
      />

      {/* Logo */}
      <div className="flex items-center gap-3 mb-2">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center"
          style={{ background: "var(--accent)", boxShadow: "0 0 24px var(--accent-glow)" }}
        >
          <BookOpen size={22} color="#000" strokeWidth={2.5} />
        </div>
        <span
          className="text-2xl font-bold tracking-tight"
          style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
        >
          Ideal
        </span>
      </div>

      <p
        className="text-sm mb-12 tracking-widest uppercase"
        style={{ color: "var(--text-muted)", letterSpacing: "0.2em" }}
      >
        Online Assessment System
      </p>

      <div className="w-full max-w-md space-y-4">
        {/* Student Entry */}
        <button
          onClick={() => router.push("/student")}
          className="w-full group relative overflow-hidden rounded-2xl p-6 text-left transition-all duration-200"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.border =
              "1px solid var(--cyan)";
            (e.currentTarget as HTMLButtonElement).style.boxShadow =
              "0 0 24px var(--cyan-glow)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.border =
              "1px solid var(--border-subtle)";
            (e.currentTarget as HTMLButtonElement).style.boxShadow = "none";
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "var(--cyan-glow)", border: "1px solid var(--cyan)" }}
              >
                <GraduationCap size={22} style={{ color: "var(--cyan)" }} />
              </div>
              <div>
                <p
                  className="font-semibold text-lg"
                  style={{ color: "var(--text-primary)" }}
                >
                  Student Portal
                </p>
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  Access your scheduled exams
                </p>
              </div>
            </div>
            <ArrowRight
              size={20}
              style={{ color: "var(--cyan)" }}
              className="group-hover:translate-x-1 transition-transform"
            />
          </div>
        </button>
        
      </div>

      <p className="mt-12 text-xs" style={{ color: "var(--text-muted)" }}>
        © {new Date().getFullYear()} Ideal Home, All rights reserved.
      </p>
    </main>
  );
}
