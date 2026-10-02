# 4. Share and test

## Fill in the app's link

Share links need the app's own web address, which only exists after the first publish.

1. In <https://make.powerapps.com>, open **Apps**, then **⋯ → Details** on *Read and Acknowledge*.
2. Copy the **Web link**. It looks like
   `https://apps.powerapps.com/play/e/<environment-id>/a/<app-id>?tenantId=<tenant-id>`.
3. Edit the app, paste it into **App → Formulas** as `AppLink`, then save and publish again.

## Share the app

1. **⋯ → Share** on the app. Add the same group of people who are in the site's Visitors group.
   Don't tick *Co-owner*.
2. Power Apps lists the data the app uses. SharePoint access is already set by the site's permissions,
   and the two flows run with the flow account's connections, so people don't need anything else.
3. Optionally, add the app to Teams: **⋯ → Add to Teams**. People can then open it from the Teams
   sidebar, and share links open inside Teams.

New admins: add their email to the **RA Admins** list, and give them **Contribute** on *RA Documents*
and *RA Expected Signers* (or run the setup script again with their address).

## Test checklist

Use two people: an admin and a reader (a colleague or a test account).

**As the admin**

- [ ] Open the app. **Admin** shows on *My documents*.
- [ ] **Admin → New document**: add a name, description, version, due date and a link. **Create document**
      takes you to its page.
- [ ] Paste two lines, one with a real colleague and one with no email address. One is *Added*; the
      other is *Skipped: no email address*.
- [ ] **Copy link**, then paste it into a new browser tab. It opens straight on that document.
- [ ] **Add me to this list**, then **Sign this document**. **Confirm** stays greyed out until you
      tick the box. After confirming, you see *Thank you. You acknowledged this document on …*.

**As the reader**

- [ ] Open the share link. The document shows, with *Signing as* and your name.
- [ ] Tick the box and **Confirm**. The confirmation shows the date and time.
- [ ] Open the link again. You see when you signed, and there's no **Confirm** button.
- [ ] *My documents* shows it as *Signed*. There's no **Admin** button.
- [ ] Open the *RA Acknowledgements* list in SharePoint. You can read it, but **+ New**, **Edit** and
      **Delete** aren't available.

**As the admin again**

- [ ] The document shows *2 of 2 signed*.
- [ ] On the reader's record, type a reason and press **Void**. The record shows *Voided … by …* and the
      reader is back to *Outstanding*.
- [ ] As the reader, sign again. It works, and both records are kept.
- [ ] **Close link**. As the reader, open the link: *This document is no longer accepting
      acknowledgements.*
- [ ] **Open records in SharePoint → Export → Export to CSV**. The file includes the voided record.

If a flow returns an error, open it in Power Automate and look at the failed run: each step shows its
inputs and outputs.
