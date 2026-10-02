# 3. Build the app

You build a **canvas app** in Power Apps Studio, then paste the formulas below into each control. It has
five screens:

| Screen | Who | What it does |
| --- | --- | --- |
| `scrHome` | Everyone | **My documents**: what you need to sign, with due dates and status |
| `scrSign` | Everyone | One document: details, a link to it, the checkbox and **Confirm** |
| `scrAdmin` | Admins | All documents, with signed and outstanding counts |
| `scrDocEdit` | Admins | Add or edit a document |
| `scrDocAdmin` | Admins | One document: share link, close or reopen, people, records, void |

How to read the tables: create the control with the name shown (rename it in the tree view), then set
each listed property to the formula. Anything not listed (size, position, font) is up to you.

> Use the **classic** controls (Insert → *Classic*) for labels, buttons, text inputs, checkboxes and
> galleries; the formulas below use their property names.

---

## Create the app

1. Go to <https://make.powerapps.com>, pick the **same environment** as the flows, then
   **+ Create → Blank app → Blank canvas app**. Name it *Read and Acknowledge*, format **Tablet**.
2. **Settings → General → Data row limit**: set it to `2000`.
3. **Data → Add data**:
   - **SharePoint**: pick your site and tick **RA Documents**, **RA Expected Signers**,
     **RA Acknowledgements** and **RA Admins**.
   - **Office 365 Users**.
4. **Power Automate** (the icon in the left bar) → **Add flow** → add **RecordAcknowledgement** and
   **VoidAcknowledgement**.
5. Add five screens and rename them `scrHome`, `scrSign`, `scrAdmin`, `scrDocEdit` and `scrDocAdmin`.

## App properties

Select **App** in the tree view.

**Formulas**

```
MeEmail = Lower(User().Email);
MeName = User().FullName;
AckStatement = "I have read and understood this document.";
DateTimeFormat = "dd mmm yyyy hh:mm";

// Your SharePoint site, without a slash at the end.
SiteUrl = "https://contoso.sharepoint.com/sites/ReadAck";

// The app's web link. Fill this in after the first publish: see 4-share-and-test.md.
AppLink = "https://apps.powerapps.com/play/e/ENVIRONMENT-ID/a/APP-ID?tenantId=TENANT-ID";

AccentColour = RGBA(31, 95, 191, 1);
OkColour = RGBA(21, 93, 44, 1);
OkFill = RGBA(229, 244, 234, 1);
WarnColour = RGBA(122, 75, 0, 1);
WarnFill = RGBA(253, 241, 220, 1);
BadColour = RGBA(143, 29, 29, 1);
BadFill = RGBA(251, 230, 230, 1);
MutedColour = RGBA(91, 101, 114, 1);
```

**OnStart**

```
// Some organisations' sign-in names differ from their email addresses, so match on both.
Set(varMeMail, Lower(Coalesce(IfError(Office365Users.MyProfileV2().mail, Blank()), User().Email)));
Set(varIsAdmin, !IsBlank(LookUp('RA Admins', Title = MeEmail || Title = varMeMail)));
Set(varDocId, IfError(Value(Param("docId")), Blank()))
```

**StartScreen**

```
If(IsBlank(Param("docId")), scrHome, scrSign)
```

A share link ends in `&docId=12`, so people who open it go straight to that document.

---

## scrHome: My documents

**Screen OnVisible**

```
Concurrent(
    ClearCollect(colMyRows, Filter('RA Expected Signers', SignerEmail = MeEmail || SignerEmail = varMeMail)),
    ClearCollect(colMyAcks, Filter('RA Acknowledgements', Status = "Valid" && (SignerEmail = MeEmail || SignerEmail = varMeMail)))
);
ClearCollect(colMine,
    ForAll(colMyRows As s,
        With({d: LookUp('RA Documents', ID = s.DocumentId), a: LookUp(colMyAcks, DocumentId = s.DocumentId)},
            {DocId: s.DocumentId, Name: d.Title, Version: d.VersionLabel, Due: d.DueDate,
             DocStatus: d.Status, SignedAt: a.AcknowledgedAt})))
```

| Control | Type | Property | Formula |
| --- | --- | --- | --- |
| `lblHomeTitle` | Label | Text | `"My documents"` |
| `lblHomeSummary` | Label | Text | see below |
| `btnGoAdmin` | Button | Text | `"Admin"` |
| | | Visible | `varIsAdmin` |
| | | OnSelect | `Navigate(scrAdmin)` |
| `galMine` | Vertical gallery (blank) | Items | `Sort(Filter(colMine, !IsBlank(Name)), If(!IsBlank(SignedAt), 2, DocStatus = "Closed", 1, 0))` |
| | | OnSelect | `Set(varDocId, ThisItem.DocId); Navigate(scrSign)` |

`lblHomeSummary.Text`:

```
With({n: CountRows(Filter(colMine, IsBlank(SignedAt) && DocStatus = "Open"))},
    If(CountRows(colMine) = 0, "You haven't been asked to acknowledge any documents yet.",
       n = 0, "You're up to date.",
       n & If(n = 1, " document needs", " documents need") & " your acknowledgement."))
```

Inside `galMine` (select the gallery, then insert into it):

| Control | Type | Property | Formula |
| --- | --- | --- | --- |
| `lblMineName` | Label | Text | `ThisItem.Name` |
| `lblMineDetails` | Label | Text | `If(!IsBlank(ThisItem.Version), "Version " & ThisItem.Version & "  ·  ", "") & If(IsBlank(ThisItem.Due), "No due date", "Due " & Text(ThisItem.Due, "dd mmm yyyy"))` |
| `lblMineStatus` | Label | Text | see below |
| | | Color | see below |

`lblMineStatus.Text`:

```
If(!IsBlank(ThisItem.SignedAt), "Signed " & Text(ThisItem.SignedAt, DateTimeFormat),
   ThisItem.DocStatus = "Closed", "Closed",
   !IsBlank(ThisItem.Due) && ThisItem.Due < Today(), "Overdue",
   "To sign")
```

`lblMineStatus.Color`:

```
If(!IsBlank(ThisItem.SignedAt), OkColour,
   ThisItem.DocStatus = "Closed", MutedColour,
   !IsBlank(ThisItem.Due) && ThisItem.Due < Today(), BadColour,
   WarnColour)
```

---

## scrSign: acknowledge a document

This screen works out one **state** and shows the controls for it:

| State | Meaning |
| --- | --- |
| `can-sign` | On the list, open, not signed yet: show the checkbox and **Confirm** |
| `signed` | Already signed: show the date and time |
| `not-listed` | Not on this document's list |
| `admin-not-listed` | An admin who isn't on the list: offer **Add me to the list** |
| `closed` | The document no longer accepts signatures |
| `missing` | The link points at a document that doesn't exist |

Add a button `btnSignRefresh` and set **Visible** to `false`. The screen runs it whenever something
changes.

`btnSignRefresh.OnSelect`:

```
Set(varDoc, LookUp('RA Documents', ID = varDocId));
Set(varMyRow, LookUp('RA Expected Signers', DocumentId = varDocId && (SignerEmail = MeEmail || SignerEmail = varMeMail)));
Set(varMyAck, LookUp('RA Acknowledgements', DocumentId = varDocId && Status = "Valid" && (SignerEmail = MeEmail || SignerEmail = varMeMail)));
Set(varState,
    If(IsBlank(varDoc), "missing",
       !IsBlank(varMyAck), "signed",
       IsBlank(varMyRow), If(varIsAdmin && varDoc.Status = "Open", "admin-not-listed", "not-listed"),
       varDoc.Status <> "Open", "closed",
       "can-sign"))
```

**Screen OnVisible**

```
Set(varJustSigned, false);
Set(varBusy, false);
Reset(chkAgree);
Select(btnSignRefresh)
```

| Control | Type | Property | Formula |
| --- | --- | --- | --- |
| `btnSignBack` | Button | Text | `"‹ My documents"` |
| | | OnSelect | `Navigate(scrHome)` |
| `lblDocName` | Label | Text | `If(varState = "missing", "Document not found", varDoc.Title)` |
| `lblDocMeta` | Label | Text | `If(!IsBlank(varDoc.VersionLabel), "Version " & varDoc.VersionLabel & Char(10), "") & If(!IsBlank(varDoc.DueDate), "Due " & Text(varDoc.DueDate, "dd mmm yyyy") & Char(10), "") & "Signing as " & MeName` |
| `lblDocDescription` | Label | Text | `varDoc.Description` |
| `btnOpenDocument` | Button | Text | `"Open the document"` |
| | | Visible | `!IsBlank(varDoc.DocumentLink)` |
| | | OnSelect | `Launch(varDoc.DocumentLink)` |
| `lblSignMessage` | Label | Text | see below |
| | | Visible | `varState <> "can-sign"` |
| | | Fill | `Switch(varState, "signed", OkFill, "missing", BadFill, WarnFill)` |
| | | Color | `Switch(varState, "signed", OkColour, "missing", BadColour, WarnColour)` |
| `btnAddMeSign` | Button | Text | `"Add me to the list"` |
| | | Visible | `varState = "admin-not-listed"` |
| | | OnSelect | `Patch('RA Expected Signers', Defaults('RA Expected Signers'), {Title: MeName, DocumentId: varDocId, SignerEmail: varMeMail}); Select(btnSignRefresh)` |
| `chkAgree` | Check box | Text | `AckStatement` |
| | | Visible | `varState = "can-sign"` |
| `btnConfirm` | Button | Text | `If(varBusy, "Confirming…", "Confirm")` |
| | | Visible | `varState = "can-sign"` |
| | | DisplayMode | `If(chkAgree.Value && !varBusy, DisplayMode.Edit, DisplayMode.Disabled)` |
| | | OnSelect | see below |
| `lblConfirmHint` | Label | Text | `"Your name, the date and time are recorded when you confirm. You can't undo this yourself."` |
| | | Visible | `varState = "can-sign"` |

`lblSignMessage.Text`:

```
Switch(varState,
    "signed", If(varJustSigned, "Thank you. ", "") & "You acknowledged this document on " & Text(varMyAck.AcknowledgedAt, DateTimeFormat) & ".",
    "not-listed", "You're not on the list for this document. If you think you should be, contact your admin.",
    "admin-not-listed", "You're not on this document's list yet. As an admin, you can add yourself.",
    "closed", "This document is no longer accepting acknowledgements.",
    "missing", "This document can't be found. Check the link you were sent.")
```

`btnConfirm.OnSelect`:

```
Set(varBusy, true);
Set(varResult, IfError(RecordAcknowledgement.Run(varDocId, Host.OSType & " | " & Host.BrowserUserAgent).result, "error"));
Set(varBusy, false);
Switch(varResult,
    "signed", Set(varJustSigned, true),
    "already", Notify("You've already acknowledged this document.", NotificationType.Information),
    "closed", Notify("This document is no longer accepting acknowledgements.", NotificationType.Warning),
    "not-listed", Notify("You're not on the list for this document. Contact your admin.", NotificationType.Error),
    Notify("That didn't go through. Check your connection and try again.", NotificationType.Error));
Refresh('RA Acknowledgements');
Select(btnSignRefresh)
```

The flow records the person, time and statement itself, so nothing the app sends can change them.

---

## scrAdmin: all documents

**Screen OnVisible**

```
If(!varIsAdmin, Navigate(scrHome));
ClearCollect(colDocs,
    ForAll('RA Documents' As d,
        With({s: Filter('RA Expected Signers', DocumentId = d.ID),
              a: Filter('RA Acknowledgements', DocumentId = d.ID && Status = "Valid")},
            {ID: d.ID, Name: d.Title, Version: d.VersionLabel, Due: d.DueDate, DocStatus: d.Status,
             Expected: CountRows(s),
             Signed: CountRows(Filter(s As x, x.SignerEmail in a.SignerEmail))})))
```

| Control | Type | Property | Formula |
| --- | --- | --- | --- |
| `lblAdminTitle` | Label | Text | `"Documents"` |
| `btnNewDocument` | Button | Text | `"New document"` |
| | | OnSelect | `Set(varDocId, Blank()); Navigate(scrDocEdit)` |
| `btnAdminMyDocs` | Button | Text | `"My documents"` |
| | | OnSelect | `Navigate(scrHome)` |
| `btnOpenRecords` | Button | Text | `"Open records in SharePoint"` |
| | | OnSelect | `Launch(SiteUrl & "/Lists/RAAcknowledgements")` |
| `lblExportHint` | Label | Text | `"To export, open the records in SharePoint, filter by document or date, then choose Export → Export to CSV."` |
| `galDocs` | Vertical gallery (blank) | Items | `Sort(colDocs, If(DocStatus = "Closed", 100000, 0) + If(IsBlank(Due), 99999, DateDiff(Date(2000, 1, 1), Due)))` |
| | | OnSelect | `Set(varDocId, ThisItem.ID); Navigate(scrDocAdmin)` |

Open documents come first, soonest due date first; closed documents go to the end.

Inside `galDocs`:

| Control | Type | Property | Formula |
| --- | --- | --- | --- |
| `lblDocsName` | Label | Text | `ThisItem.Name & If(!IsBlank(ThisItem.Version), "  ·  Version " & ThisItem.Version, "")` |
| `lblDocsDue` | Label | Text | `If(IsBlank(ThisItem.Due), "No due date", "Due " & Text(ThisItem.Due, "dd mmm yyyy")) & If(ThisItem.DocStatus = "Open" && ThisItem.Signed < ThisItem.Expected && !IsBlank(ThisItem.Due) && ThisItem.Due < Today(), "  ·  Overdue", "")` |
| `lblDocsSigned` | Label | Text | `ThisItem.Signed & " of " & ThisItem.Expected & " signed  ·  " & (ThisItem.Expected - ThisItem.Signed) & " outstanding"` |
| `rectTrack` | Rectangle | Fill | `RGBA(214, 218, 224, 1)` |
| `rectFill` | Rectangle | Fill | `OkColour` |
| | | X | `rectTrack.X` |
| | | Width | `rectTrack.Width * If(ThisItem.Expected = 0, 0, ThisItem.Signed / ThisItem.Expected)` |
| `lblDocsStatus` | Label | Text | `If(ThisItem.DocStatus = "Open", "Open", "Closed")` |
| | | Color | `If(ThisItem.DocStatus = "Open", OkColour, MutedColour)` |

---

## scrDocEdit: add or edit a document

| Control | Type | Property | Formula |
| --- | --- | --- | --- |
| `frmDocument` | Edit form | DataSource | `'RA Documents'` |
| | | Item | `LookUp('RA Documents', ID = varDocId)` |
| | | DefaultMode | `If(IsBlank(varDocId), FormMode.New, FormMode.Edit)` |
| | | OnSuccess | `Set(varDocId, frmDocument.LastSubmit.ID); Notify("Saved.", NotificationType.Success); Navigate(scrDocAdmin)` |
| | | OnFailure | `Notify("Couldn't save: " & frmDocument.Error, NotificationType.Error)` |
| `btnSaveDocument` | Button | Text | `If(IsBlank(varDocId), "Create document", "Save changes")` |
| | | OnSelect | `SubmitForm(frmDocument)` |
| `btnCancelDocument` | Button | Text | `"Cancel"` |
| | | OnSelect | `If(IsBlank(varDocId), Navigate(scrAdmin), Navigate(scrDocAdmin))` |

**Screen OnVisible**: `ResetForm(frmDocument)`

In the form's **Edit fields**, keep *Document name*, *Description*, *Version*, *Due date* and *Where
the document is held*, and remove *Status* and *Attachments*. New documents start as `Open`
from the column's default value.

---

## scrDocAdmin: one document

Add a hidden button `btnDocReload` (**Visible** = `false`).

`btnDocReload.OnSelect`:

```
Set(varDoc, LookUp('RA Documents', ID = varDocId));
ClearCollect(colDocSigners, Filter('RA Expected Signers', DocumentId = varDocId));
ClearCollect(colDocAcks, Filter('RA Acknowledgements', DocumentId = varDocId));
Set(varSignedCount, CountRows(Filter(colDocSigners As s, !IsBlank(LookUp(colDocAcks, Status = "Valid" && SignerEmail = s.SignerEmail)))));
Set(varMeListed, !IsBlank(LookUp(colDocSigners, SignerEmail = MeEmail || SignerEmail = varMeMail)));
Set(varMyDocAck, LookUp(colDocAcks, Status = "Valid" && (SignerEmail = MeEmail || SignerEmail = varMeMail)))
```

**Screen OnVisible**

```
If(!varIsAdmin, Navigate(scrHome));
Clear(colAddResults);
Select(btnDocReload)
```

### Header and share link

| Control | Type | Property | Formula |
| --- | --- | --- | --- |
| `btnDocBack` | Button | Text | `"‹ Documents"` |
| | | OnSelect | `Navigate(scrAdmin)` |
| `lblDocAdminName` | Label | Text | `varDoc.Title & If(varDoc.Status = "Open", "  (Open)", "  (Closed)")` |
| `lblDocAdminProgress` | Label | Text | `varSignedCount & " of " & CountRows(colDocSigners) & " signed" & If(!IsBlank(varDoc.VersionLabel), "  ·  Version " & varDoc.VersionLabel, "") & If(!IsBlank(varDoc.DueDate), "  ·  Due " & Text(varDoc.DueDate, "dd mmm yyyy"), "")` |
| `btnEditDetails` | Button | Text | `"Edit details"` |
| | | OnSelect | `Navigate(scrDocEdit)` |
| `txtShareLink` | Text input | Default | `AppLink & "&docId=" & varDocId` |
| `btnCopyLink` | Button | Text | `"Copy link"` |
| | | OnSelect | `Copy(txtShareLink.Text); Notify("Link copied. Send it by email, Teams or intranet.", NotificationType.Success)` |
| `btnToggleStatus` | Button | Text | `If(varDoc.Status = "Open", "Close link (stop accepting signatures)", "Reopen link")` |
| | | OnSelect | `Patch('RA Documents', varDoc, {Status: If(varDoc.Status = "Open", "Closed", "Open")}); Select(btnDocReload)` |

### Your acknowledgement

| Control | Type | Property | Formula |
| --- | --- | --- | --- |
| `lblMyDocStatus` | Label | Text | `If(!IsBlank(varMyDocAck), "You acknowledged this document on " & Text(varMyDocAck.AcknowledgedAt, DateTimeFormat) & ".", varMeListed, "You're on this document's list and haven't signed yet.", "You're not on this document's list. Admins acknowledge documents the same way as everyone else.")` |
| `btnAddMe` | Button | Text | `"Add me to this list"` |
| | | Visible | `!varMeListed` |
| | | OnSelect | `Patch('RA Expected Signers', Defaults('RA Expected Signers'), {Title: MeName, DocumentId: varDocId, SignerEmail: varMeMail}); Select(btnDocReload)` |
| `btnSignMine` | Button | Text | `"Sign this document"` |
| | | Visible | `varMeListed && IsBlank(varMyDocAck) && varDoc.Status = "Open"` |
| | | OnSelect | `Navigate(scrSign)` |

### People expected to sign

| Control | Type | Property | Formula |
| --- | --- | --- | --- |
| `galSigners` | Vertical gallery (blank) | Items | `Sort(colDocSigners, Title)` |
| `txtPeople` | Text input | Mode | `TextMode.MultiLine` |
| | | HintText | `"One per line: Name, email. Or paste two columns from Excel."` |
| `btnAddPeople` | Button | Text | `"Add to this document"` |
| | | OnSelect | see below |
| `galAddResults` | Vertical gallery (blank) | Items | `colAddResults` |

Inside `galSigners`:

| Control | Type | Property | Formula |
| --- | --- | --- | --- |
| `lblSignerName` | Label | Text | `ThisItem.Title & "  ·  " & ThisItem.SignerEmail` |
| `lblSignerStatus` | Label | Text | `With({a: LookUp(colDocAcks, Status = "Valid" && SignerEmail = ThisItem.SignerEmail)}, If(!IsBlank(a), "Signed " & Text(a.AcknowledgedAt, DateTimeFormat), !IsBlank(varDoc.DueDate) && varDoc.DueDate < Today(), "Overdue", "Outstanding"))` |
| `icoRemoveSigner` | Icon (Trash) | OnSelect | `Remove('RA Expected Signers', LookUp('RA Expected Signers', ID = ThisItem.ID)); Select(btnDocReload)` |
| | | AccessibleLabel | `"Remove " & ThisItem.Title & " from this document"` |

Inside `galAddResults`: a label with **Text** `ThisItem.Result & ":  " & ThisItem.Line`.

`btnAddPeople.OnSelect`:

```
Clear(colAddResults);
// One row per non-empty line, with the email address found in it.
ClearCollect(colPaste,
    ForAll(Filter(Split(Substitute(txtPeople.Text, Char(13), ""), Char(10)), !IsBlank(Trim(Value))) As line,
        With({found: Match(line.Value, "[^\s,;<>""]+@[^\s,;<>""]+\.[^\s,;<>""]+")},
            {Line: line.Value,
             Email: Lower(found.FullMatch),
             TypedName: If(IsBlank(found), "", Trim(Substitute(Substitute(Substitute(line.Value, found.FullMatch, ""), Char(9), " "), ",", " ")))})));
ForAll(Filter(colPaste, IsBlank(Email)) As bad,
    Collect(colAddResults, {Line: bad.Line, Result: "Skipped: no email address"}));
// Each address once, even if it was pasted twice.
ForAll(Distinct(Filter(colPaste, !IsBlank(Email)), Email) As e,
    With({row: LookUp(colPaste, Email = e.Value)},
        If(!IsBlank(LookUp(colDocSigners, SignerEmail = e.Value)),
            Collect(colAddResults, {Line: row.Line, Result: "Already on the list"}),
            With({p: IfError(Office365Users.UserProfileV2(e.Value), Blank())},
                Patch('RA Expected Signers', Defaults('RA Expected Signers'),
                    {Title: Coalesce(p.displayName, row.TypedName, e.Value),
                     DocumentId: varDocId,
                     SignerEmail: Lower(Coalesce(p.mail, e.Value))});
                Collect(colAddResults, {Line: row.Line,
                    Result: If(IsBlank(p), "Added, but not found in your directory, so check the address", "Added")})))));
Reset(txtPeople);
Select(btnDocReload)
```

People are looked up in your organisation's directory, so their proper name and email address are
stored even if you type a nickname.

### Acknowledgement records

| Control | Type | Property | Formula |
| --- | --- | --- | --- |
| `galAcks` | Vertical gallery (blank) | Items | `Sort(colDocAcks, AcknowledgedAt, SortOrder.Descending)` |
| `lblRecordsHint` | Label | Text | `"Records can't be edited or deleted. Voiding keeps the record and the reason."` |

Inside `galAcks`:

| Control | Type | Property | Formula |
| --- | --- | --- | --- |
| `lblAckWho` | Label | Text | `ThisItem.Title & "  ·  " & ThisItem.SignerEmail` |
| `lblAckWhen` | Label | Text | `"Signed " & Text(ThisItem.AcknowledgedAt, DateTimeFormat) & If(!IsBlank(ThisItem.VersionLabel), "  ·  Version " & ThisItem.VersionLabel, "")` |
| `lblAckVoided` | Label | Text | `"Voided " & Text(ThisItem.VoidedAt, DateTimeFormat) & " by " & ThisItem.VoidedBy & ": " & ThisItem.VoidReason` |
| | | Visible | `ThisItem.Status = "Voided"` |
| `txtVoidReason` | Text input | HintText | `"Reason for voiding"` |
| | | Visible | `ThisItem.Status = "Valid"` |
| `btnVoid` | Button | Text | `"Void"` |
| | | Visible | `ThisItem.Status = "Valid"` |
| | | DisplayMode | `If(Len(Trim(txtVoidReason.Text)) > 0, DisplayMode.Edit, DisplayMode.Disabled)` |
| | | OnSelect | see below |

`btnVoid.OnSelect`:

```
Set(varVoidResult, IfError(VoidAcknowledgement.Run(ThisItem.ID, txtVoidReason.Text).result, "error"));
Switch(varVoidResult,
    "voided", Notify("Voided. " & ThisItem.Title & " can sign again.", NotificationType.Success),
    "already", Notify("This record was already voided.", NotificationType.Information),
    "not-authorised", Notify("Only admins can void records.", NotificationType.Error),
    "reason-required", Notify("Give a reason for voiding.", NotificationType.Warning),
    Notify("That didn't go through. Try again.", NotificationType.Error));
Refresh('RA Acknowledgements');
Select(btnDocReload)
```

---

## Check for problems

Open **App checker** (the stethoscope icon). There should be no errors. You may see blue
delegation warnings on `ForAll`, `CountRows` and `Distinct`; they're expected (see *Limits* in the
README).

Save the app (**File → Save**), then **Publish**.

Next: [share and test](4-share-and-test.md).
