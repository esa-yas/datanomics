export function formatProfessionalReply(body: string, channel?: string): string {
  let text = body.replace(/\r\n/g, '\n').trim();
  if (!text) return text;

  text = text.replace(/\\n/g, '\n');

  if (channel === 'linkedin' || channel === 'phone') {
    return text.replace(/\n{3,}/g, '\n\n').trim();
  }

  if (!text.includes('\n\n')) {
    const greetingMatch = text.match(
      /^(Hi|Hello|Dear|Good morning|Good afternoon|Hey)[^,\n]*,/i,
    );
    if (greetingMatch) {
      const end = greetingMatch[0].length;
      text = `${text.slice(0, end)}\n\n${text.slice(end).trim()}`;
    }

    text = text.replace(
      /\s+(Best regards|Best|Regards|Thank you|Thanks|Sincerely|Warm regards|Kind regards),/i,
      '\n\n$1,',
    );
  }

  return text.replace(/\n{3,}/g, '\n\n').trim();
}

export const REPLY_FORMAT_INSTRUCTION = `FORMAT (required):
- Use real newline characters in the JSON body string.
- Structure: greeting line, blank line, 1–3 short paragraphs (blank line between each), blank line, professional sign-off with first name.
- Example shape:
Hi [Name],

Thank you for reaching out. [Main point paragraph.]

[Optional second paragraph with next step or questions.]

Best regards,
[First name]`;
