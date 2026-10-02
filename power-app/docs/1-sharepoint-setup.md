# 1. Set up SharePoint

The app keeps its data in four SharePoint lists on one site. This takes about 15 minutes.

## Create the site

1. In SharePoint, **+ Create site → Team site** (or a communication site). Call it *Read and Acknowledge*.
2. Set **Settings → Site information → View all site settings → Regional settings** to your time zone
   (e.g. *(UTC+00:00) Dublin, Edinburgh, Lisbon, London*), so dates and times show correctly.
3. Add everyone who will acknowledge documents to the site's **Visitors** group, or better, add one
   Microsoft 365 group or security group that contains them. They need Read access to see their documents.
4. Keep the **Owners** group to the one or two people who look after the app. Owners can change any list.

## Create the lists

### Option A: run the script (recommended)

You need [PowerShell 7](https://learn.microsoft.com/powershell/scripting/install/installing-powershell) and
the PnP PowerShell module.

```powershell
Install-Module PnP.PowerShell -Scope CurrentUser

# Once per tenant: create the sign-in app that PnP PowerShell uses, and note its Client ID.
Register-PnPEntraIDAppForInteractiveLogin -ApplicationName "PnP PowerShell" -Tenant contoso.onmicrosoft.com

./provisioning/Create-ReadAckLists.ps1 `
  -SiteUrl https://contoso.sharepoint.com/sites/ReadAck `
  -ClientId <the Client ID from the step above> `
  -AdminEmails jo.admin@contoso.com, sam.patel@contoso.com `
  -FlowAccount svc-readack@contoso.com
```

- **AdminEmails**: the people who will manage documents.
- **FlowAccount**: the account that will own the Power Automate flows. A dedicated service account is
  best, so the flows don't stop working if a person leaves. Any licensed account works for a trial.

The script is safe to run again, for example to add another admin.

### Option B: create the lists by hand

Create four lists (**+ New → List → Blank list**). Name them `RADocuments`, `RAExpectedSigners`,
`RAAcknowledgements` and `RAAdmins` first, because the first name becomes the list's web address and
the app links to it. Then rename them (**List settings → List name**) to *RA Documents*,
*RA Expected Signers*, *RA Acknowledgements* and *RA Admins*.

Rename each list's **Title** column as shown, then add the
other columns with exactly these names. Type the name without spaces first (that becomes its internal
name), then rename it to the display name if you want one.

**RA Documents**

| Column | Type | Notes |
| --- | --- | --- |
| Title → *Document name* | Single line of text | Required |
| Description | Multiple lines of text | Plain text |
| VersionLabel | Single line of text | |
| DueDate | Date and time | Date only |
| DocumentLink | Hyperlink | Where the document is held |
| Status | Single line of text | Required, default value `Open`, indexed |

**RA Expected Signers**

| Column | Type | Notes |
| --- | --- | --- |
| Title → *Name* | Single line of text | Required |
| DocumentId | Number | Required, 0 decimal places, indexed |
| SignerEmail | Single line of text | Required, indexed |

**RA Acknowledgements**

| Column | Type | Notes |
| --- | --- | --- |
| Title → *Name* | Single line of text | Required |
| SignerEmail | Single line of text | Required, indexed |
| DocumentId | Number | Required, indexed |
| DocumentName | Single line of text | Required |
| VersionLabel | Single line of text | |
| Statement | Multiple lines of text | Required, plain text |
| AcknowledgedAt | Date and time | Required, include time, indexed |
| Client | Multiple lines of text | Device and browser |
| Status | Single line of text | Required, default value `Valid`, indexed |
| VoidedAt | Date and time | Include time |
| VoidedBy | Single line of text | |
| VoidReason | Multiple lines of text | |

**RA Admins**

| Column | Type | Notes |
| --- | --- | --- |
| Title → *Email* | Single line of text | One row per admin, lower case |

Turn on **version history** for every list (**List settings → Versioning settings**).

Then set permissions on each list (**List settings → Permissions for this list → Stop inheriting permissions**):

| List | Site Members and Visitors | Admins | Flow account |
| --- | --- | --- | --- |
| RA Documents | Read | Contribute | Read |
| RA Expected Signers | Read | Contribute | Read |
| RA Acknowledgements | Read | Read | Contribute |
| RA Admins | Read | Read | Read |

## Why the permissions look like this

- **Nobody but the flow account can write acknowledgements.** Readers and admins can't add, change or
  delete records in SharePoint, even outside the app. Signing and voiding go through the two flows, which
  check who is calling and record the time themselves.
- **Version history** keeps a copy of every change, so an edit made by a site owner can still be traced.
- **Everyone with Read can see the lists in SharePoint**, including who has signed what. For internal
  staff this is usually fine. If it isn't, see *Hiding other people's records* in the main README.

Next: [build the flows](2-power-automate-flows.md).
