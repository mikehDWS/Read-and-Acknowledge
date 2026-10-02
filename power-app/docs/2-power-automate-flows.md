# 2. Build the two Power Automate flows

The app never writes to **RA Acknowledgements** itself. Two flows do, using the flow account's
connections:

| Flow | Called when | What it checks |
| --- | --- | --- |
| **RecordAcknowledgement** | A reader presses **Confirm** | The document exists and is open, the caller is on its list, and hasn't already signed |
| **VoidAcknowledgement** | An admin voids a record | The caller is in **RA Admins**, a reason is given, and the record isn't already voided |

Both flows work out **who is calling from Microsoft 365 itself** (the `x-ms-user-email` header that
Power Apps sends), not from anything the app passes in, and both set the time with `utcNow()`. So a
user can't sign as someone else or back-date a record, even with a modified app.

Sign in to <https://make.powerautomate.com> **as the flow account**, in the same environment you'll build
the app in. Both flows use **Instant cloud flow → When Power Apps calls a flow (V2)**.

> **Name every action exactly as shown** (⋯ → *Rename*). The expressions below refer to actions by
> name: an action called `GetDocument` is `body('GetDocument')`. Paste an expression in the
> **Expression** tab (the *fx* button), not as plain text.
>
> Trigger inputs are referred to by type: the first Number input is `triggerBody()?['number']` and
> the first Text input is `triggerBody()?['text']`. Add the inputs in the order shown so these match.
> If yours differ, pick the input from **Dynamic content** instead.

---

## Flow 1: RecordAcknowledgement

Name the flow `RecordAcknowledgement` (no spaces; the app calls it by this name).

### Trigger inputs

| Input | Type |
| --- | --- |
| DocumentId | Number |
| Client | Text |

### Steps

**1. `GetCaller`**: Office 365 Users → **Get user profile (V2)**
- User (UPN): `triggerOutputs()?['headers']?['x-ms-user-email']`

**2. `CallerEmail`**: Initialize variable, String
- Value: `toLower(coalesce(body('GetCaller')?['mail'], triggerOutputs()?['headers']?['x-ms-user-email']))`

**3. `CallerUpn`**: Initialize variable, String
- Value: `toLower(coalesce(body('GetCaller')?['userPrincipalName'], triggerOutputs()?['headers']?['x-ms-user-email']))`

**4. `GetDocument`**: SharePoint → **Get items**, list *RA Documents*
- Filter Query: `ID eq @{triggerBody()?['number']}`. Easier: type `ID eq ` and pick **DocumentId**
  from dynamic content.
- Top Count: `1`

**5. Condition `DocumentFound`**: `length(body('GetDocument')?['value'])` *is equal to* `0`
- **If yes**: add **Respond to a PowerApp or flow** with two Text outputs, `result` = `missing` and
  `acknowledgedAt` = *(leave empty)*. Then add **Terminate**, status *Succeeded*.

**6. Condition `DocumentOpen`**: `first(body('GetDocument')?['value'])?['Status']` *is not equal to* `Open`
- **If yes**: Respond `result` = `closed`, `acknowledgedAt` empty, then Terminate (Succeeded).

**7. `GetSignerRow`**: SharePoint → **Get items**, list *RA Expected Signers*
- Filter Query (expression):
  ```
  concat('DocumentId eq ', triggerBody()?['number'], ' and (SignerEmail eq ''', replace(variables('CallerEmail'), '''', ''''''), ''' or SignerEmail eq ''', replace(variables('CallerUpn'), '''', ''''''), ''')')
  ```
  This finds the caller by either their email or their sign-in name. The `replace` handles
  addresses with an apostrophe, such as `o'brien@contoso.com`.
- Top Count: `1`

**8. Condition `OnTheList`**: `length(body('GetSignerRow')?['value'])` *is equal to* `0`
- **If yes**: Respond `result` = `not-listed`, then Terminate (Succeeded).

**9. `SignerEmail`**: Initialize variable, String
- Value: `first(body('GetSignerRow')?['value'])?['SignerEmail']`

**10. `GetExisting`**: SharePoint → **Get items**, list *RA Acknowledgements*
- Filter Query (expression):
  ```
  concat('DocumentId eq ', triggerBody()?['number'], ' and Status eq ''Valid'' and SignerEmail eq ''', replace(variables('SignerEmail'), '''', ''''''), '''')
  ```
- Top Count: `1`

**11. Condition `AlreadySigned`**: `length(body('GetExisting')?['value'])` *is greater than* `0`
- **If yes**: Respond `result` = `already`,
  `acknowledgedAt` = `first(body('GetExisting')?['value'])?['AcknowledgedAt']`, then Terminate (Succeeded).

**12. `CreateAck`**: SharePoint → **Create item**, list *RA Acknowledgements*

| Field | Value |
| --- | --- |
| Name (Title) | `coalesce(body('GetCaller')?['displayName'], first(body('GetSignerRow')?['value'])?['Title'])` |
| Email (SignerEmail) | `variables('SignerEmail')` |
| Document ID | **DocumentId** (dynamic content) |
| Document (DocumentName) | `first(body('GetDocument')?['value'])?['Title']` |
| Version (VersionLabel) | `first(body('GetDocument')?['value'])?['VersionLabel']` |
| Statement | `I have read and understood this document.` (type it as plain text) |
| Acknowledged at | `utcNow()` |
| Device and browser (Client) | **Client** (dynamic content) |
| Status | `Valid` |

The statement is fixed in the flow, not sent by the app, so the stored wording can't be altered.

**13. Respond to a PowerApp or flow**
- `result` = `signed`
- `acknowledgedAt` = `body('CreateAck')?['AcknowledgedAt']`

> Every **Respond** action in the flow must have the same two outputs (`result` and `acknowledgedAt`),
> both Text, or the app can't read the answer.

---

## Flow 2: VoidAcknowledgement

Name the flow `VoidAcknowledgement`.

### Trigger inputs

| Input | Type |
| --- | --- |
| AcknowledgementId | Number |
| Reason | Text |

### Steps

**1–3.** `GetCaller`, `CallerEmail` and `CallerUpn`, exactly as in flow 1.

**4. `GetAdmin`**: SharePoint → **Get items**, list *RA Admins*
- Filter Query (expression):
  ```
  concat('Title eq ''', replace(variables('CallerEmail'), '''', ''''''), ''' or Title eq ''', replace(variables('CallerUpn'), '''', ''''''), '''')
  ```
- Top Count: `1`

**5. Condition `IsAdmin`**: `length(body('GetAdmin')?['value'])` *is equal to* `0`
- **If yes**: **Respond to a PowerApp or flow** with one Text output `result` = `not-authorised`, then
  Terminate (Succeeded).

**6. Condition `HasReason`**: `length(trim(coalesce(triggerBody()?['text'], '')))` *is equal to* `0`
- **If yes**: Respond `result` = `reason-required`, then Terminate (Succeeded).

**7. `GetAck`**: SharePoint → **Get items**, list *RA Acknowledgements*
- Filter Query: `ID eq ` then pick **AcknowledgementId** from dynamic content
- Top Count: `1`

**8. Condition `AckFound`**: `length(body('GetAck')?['value'])` *is equal to* `0`
- **If yes**: Respond `result` = `missing`, then Terminate (Succeeded).

**9. Condition `StillValid`**: `first(body('GetAck')?['value'])?['Status']` *is not equal to* `Valid`
- **If yes**: Respond `result` = `already`, then Terminate (Succeeded).

**10. `UpdateAck`**: SharePoint → **Update item**, list *RA Acknowledgements*
- Id: **AcknowledgementId** (dynamic content)
- SharePoint asks for the required columns again. Fill them with the record's current values so
  nothing else changes:

| Field | Value |
| --- | --- |
| Name (Title) | `first(body('GetAck')?['value'])?['Title']` |
| Email (SignerEmail) | `first(body('GetAck')?['value'])?['SignerEmail']` |
| Document ID | `first(body('GetAck')?['value'])?['DocumentId']` |
| Document (DocumentName) | `first(body('GetAck')?['value'])?['DocumentName']` |
| Statement | `first(body('GetAck')?['value'])?['Statement']` |
| Acknowledged at | `first(body('GetAck')?['value'])?['AcknowledgedAt']` |
| Status | `Voided` |
| Voided at | `utcNow()` |
| Voided by | `variables('CallerEmail')` |
| Void reason | **Reason** (dynamic content) |

Leave every other field empty: **Update item** only changes the fields you fill in.

**11. Respond to a PowerApp or flow**: `result` = `voided`

---

## Test each flow

Save each flow, then use **Test → Manually**. Power Automate asks for the inputs, and the test runs as you.
For flow 1, a `not-listed` result is expected until you add yourself to a document's list.

Next: [build the app](3-build-the-app.md).
