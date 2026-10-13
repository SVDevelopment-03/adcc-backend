import dayjs from 'dayjs';
import { createEvent as createIcsEvent } from 'ics';
import Challenge from '@/models/challenge.model';
import User from '@/models/user.model';
import emailService from '@/services/email.service';
import { announcementEmail } from '@/services/emailTemplates';

/**
 * Emails sent to a rider when they join or leave an event, community or challenge.
 * All of them use the announcement (push notification) layout and are best-effort:
 * a failed send is logged and never fails the request that triggered it.
 */

type MailVars = Parameters<typeof announcementEmail>[0];
type Attachment = { filename: string; content: string; contentType?: string };

const getSiteUrl = () => (process.env.FRONTEND_BASE_URL || 'https://adcyclingclub.ae').replace(/\/$/, '');

const formatDate = (d?: Date | string | null, format = 'dddd, D MMMM YYYY') => (d ? dayjs(d).format(format) : '');

async function sendToUser(
  tag: string,
  userId: string,
  build: (name: string) => { mail: MailVars; attachments?: Attachment[] }
): Promise<void> {
  try {
    const user = await User.findById(userId).select('fullName email').lean();
    const email = (user as any)?.email as string | undefined;
    if (!email) return;

    const { mail: vars, attachments } = build((user as any)?.fullName?.trim() || 'Member');
    const mail = announcementEmail(vars);
    await emailService.sendEmail({ to: [email], subject: mail.subject, text: mail.text, html: mail.html, attachments });
  } catch (err: any) {
    console.error(`[participation-email] ${tag} failed`, err?.message ?? err);
  }
}

function buildEventIcs(event: EventInfo): Attachment[] {
  if (!event.eventDate) return [];
  try {
    const d = new Date(event.eventDate);
    // The start time lives in eventTime ("HH:mm"); written as a floating local time so
    // calendars show it exactly as the club published it.
    const timeMatch = /^(\d{1,2}):(\d{2})/.exec(event.eventTime || '');
    const day = dayjs(event.eventDate);
    const start = timeMatch
      ? {
          start: [day.year(), day.month() + 1, day.date(), Number(timeMatch[1]), Number(timeMatch[2])],
          startInputType: 'local',
          startOutputType: 'local',
        }
      : { start: [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes()] };
    const { error, value } = createIcsEvent({
      ...start,
      duration: { minutes: 180 },
      title: event.title || 'Event',
      description: event.description || '',
      location: event.address || '',
    } as any);
    if (error || !value) return [];
    return [
      {
        filename: `${(event.title || 'event').replace(/[^a-z0-9]/gi, '_')}.ics`,
        content: value,
        contentType: 'text/calendar',
      },
    ];
  } catch (e) {
    console.error('[participation-email] ICS generation failed', (e as Error).message);
    return [];
  }
}

type EventInfo = {
  _id: unknown;
  slug?: string | null;
  title?: string | null;
  eventDate?: Date | string | null;
  eventTime?: string | null;
  address?: string | null;
  description?: string | null;
};

const eventUrl = (event: EventInfo) => `${getSiteUrl()}/events/${encodeURIComponent(String(event.slug || event._id))}`;

export function sendEventRegistrationEmail(params: { userId: string; event: EventInfo }): Promise<void> {
  const { event } = params;
  const title = event.title || 'Event';
  return sendToUser('event registration', params.userId, (name) => {
    const attachments = buildEventIcs(event);
    const details = [
      event.eventDate ? `Date: ${formatDate(event.eventDate)}${event.eventTime ? `, ${event.eventTime}` : ''}` : '',
      event.address ? `Location: ${event.address}` : '',
    ].filter(Boolean);
    return {
      attachments,
      mail: {
        label: 'Event registration',
        title: `You're registered: ${title}`,
        body: [
          `Hi ${name},`,
          `Your place at ${title} is confirmed.`,
          details.join('\n'),
          attachments.length
            ? 'A calendar file is attached to this email so you can add the event to your calendar.'
            : '',
          'If your plans change, please cancel your registration from the event page in the ADCC app so your place can go to another rider.',
        ]
          .filter(Boolean)
          .join('\n\n'),
        actions: [{ title: 'View event', action: eventUrl(event) }],
      },
    };
  });
}

export function sendEventCancellationEmail(params: {
  userId: string;
  event: EventInfo;
  reason?: string;
}): Promise<void> {
  const { event } = params;
  const title = event.title || 'Event';
  const reason = params.reason?.trim();
  return sendToUser('event cancellation', params.userId, (name) => ({
    mail: {
      label: 'Event registration',
      title: `Registration cancelled: ${title}`,
      body: [
        `Hi ${name},`,
        `Your registration for ${title}${event.eventDate ? ` on ${formatDate(event.eventDate)}` : ''} has been cancelled and your place has been released.`,
        reason ? `Reason you gave: ${reason}` : '',
        'Changed your mind? You can register again from the event page for as long as registration is open.',
      ]
        .filter(Boolean)
        .join('\n\n'),
      actions: [
        { title: 'View event', action: eventUrl(event) },
        { title: 'Browse events', action: `${getSiteUrl()}/events` },
      ],
    },
  }));
}

export function sendCommunityJoinedEmail(params: {
  userId: string;
  communityId: string;
  communityTitle?: string | null;
}): Promise<void> {
  const title = params.communityTitle || 'the community';
  return sendToUser('community joined', params.userId, (name) => ({
    mail: {
      label: 'Community membership',
      title: `Welcome to ${title}`,
      body: [
        `Hi ${name},`,
        `You are now a member of ${title}.`,
        "You will find the community's rides, events and challenges in the ADCC app, and we will let you know when something new is announced.",
      ].join('\n\n'),
      actions: [{ title: 'View community', action: `${getSiteUrl()}/communities/${params.communityId}` }],
    },
  }));
}

export function sendCommunityLeftEmail(params: {
  userId: string;
  communityId: string;
  communityTitle?: string | null;
}): Promise<void> {
  const title = params.communityTitle || 'the community';
  return sendToUser('community left', params.userId, (name) => ({
    mail: {
      label: 'Community membership',
      title: `You have left ${title}`,
      body: [
        `Hi ${name},`,
        `This confirms that you have left ${title}. You will no longer receive updates from this community.`,
        'Your ADCC account, your event registrations and your other communities are not affected.',
        'You are welcome back at any time. You can rejoin from the community page.',
      ].join('\n\n'),
      actions: [
        { title: 'View community', action: `${getSiteUrl()}/communities/${params.communityId}` },
        { title: 'Explore communities', action: `${getSiteUrl()}/communities` },
      ],
    },
  }));
}

export async function sendChallengeLeftEmail(params: { userId: string; challengeId: string }): Promise<void> {
  const challenge = await Challenge.findById(params.challengeId)
    .select('title endDate')
    .lean()
    .catch(() => null);
  if (!challenge) return;

  const title = challenge.title;
  const stillOpen = challenge.endDate && new Date(challenge.endDate).getTime() > Date.now();
  return sendToUser('challenge left', params.userId, (name) => ({
    mail: {
      label: 'Challenge registration',
      title: `You have left: ${title}`,
      body: [
        `Hi ${name},`,
        `This confirms that you have left ${title}. Your progress in this challenge is no longer being tracked.`,
        stillOpen
          ? `If you join again before the challenge ends on ${formatDate(challenge.endDate, 'D MMMM YYYY')}, your progress will start again from zero.`
          : '',
      ]
        .filter(Boolean)
        .join('\n\n'),
      actions: [
        { title: 'View challenge', action: `${getSiteUrl()}/challenges/${params.challengeId}` },
        { title: 'Browse challenges', action: `${getSiteUrl()}/challenges` },
      ],
    },
  }));
}
