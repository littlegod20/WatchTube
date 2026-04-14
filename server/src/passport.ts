import bcrypt from "bcrypt";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { prisma } from "./lib/prisma.js";

export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
};

passport.use(
  new LocalStrategy(
    { usernameField: "email", passwordField: "password" },
    async (email, password, done) => {
      try {
        const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
        if (!user?.passwordHash) return done(null, false, { message: "Invalid credentials" });
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return done(null, false, { message: "Invalid credentials" });
        const sessionUser: SessionUser = {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
        };
        return done(null, sessionUser);
      } catch (e) {
        return done(e as Error);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, (user as SessionUser).id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, displayName: true, avatarUrl: true },
    });
    done(null, user ?? false);
  } catch (e) {
    done(e as Error);
  }
});

export { passport };
