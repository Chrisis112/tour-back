import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as FacebookStrategy } from 'passport-facebook';
import User from './src/models/User';

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: `${process.env.BASE_URL}/api/auth/google/callback`,
    },
    async (accessToken, refreshToken, profile, done) => {
      console.log('Google OAuth profile:', profile);

      try {
        let user = await User.findOne({
          oauthProvider: 'google',
          oauthId: profile.id,
        });

        const email = profile.emails?.[0]?.value;

        if (!user) {
          if (!email) {
            console.error('Google profile email is missing:', profile);
            return done(new Error('Email обязательный параметр от Google'), undefined);
          }

          user = await User.create({
            oauthProvider: 'google',
            oauthId: profile.id,
            email,
            firstName: profile.name?.givenName || '',
            lastName: profile.name?.familyName || undefined,
            userType: 'CLIENT',
            // passwordHash: '' // если поле обязано, временно можно так сделать
          });
          console.log('Created new user from Google profile:', user);
        } else {
          console.log('Found existing user:', user);
        }
        done(null, user);
      } catch (err) {
        console.error('Error in GoogleStrategy callback:', err);
        done(err);
      }
    },
  ),
);

passport.use(new FacebookStrategy({
  clientID: process.env.FACEBOOK_CLIENT_ID!,
  clientSecret: process.env.FACEBOOK_CLIENT_SECRET!,
  callbackURL: `${process.env.BASE_URL}/api/auth/facebook/callback`,
  profileFields: ['id', 'emails', 'name'],
}, async (accessToken, refreshToken, profile, done) => {
  try {
    console.log('FB PROFILE', profile);

    let user = await User.findOne({ oauthProvider: 'facebook', oauthId: profile.id });
    if (!user) {
      if (!profile.emails || !profile.emails[0]?.value) {
        console.error('No email from Facebook:', profile);
        return done(new Error('Facebook did not return an email!'), null);
      }
      user = await User.create({
        oauthProvider: 'facebook',
        oauthId: profile.id,
        email: profile.emails[0].value,
        firstName: profile.name?.givenName || '',
        lastName: profile.name?.familyName || '',
        userType: 'CLIENT',
      });
    }
    done(null, user);
  } catch (err) {
    console.error('Error in FacebookStrategy:', err);
    done(err, null);
  }
}));

export default passport;
