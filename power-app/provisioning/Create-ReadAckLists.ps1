<#
.SYNOPSIS
  Creates the SharePoint lists and permissions for the Read and Acknowledge Power App.

.DESCRIPTION
  Safe to run more than once: lists, columns and admins that already exist are left as they are.

  Creates four lists on the site:
    RA Documents          the documents people acknowledge (name only; the file lives elsewhere)
    RA Expected Signers   who is expected to sign which document
    RA Acknowledgements   the audit trail, written only by the Power Automate flows
    RA Admins             email addresses of the people who can use the admin screens
  Their web addresses are fixed (Lists/RADocuments, Lists/RAExpectedSigners, Lists/RAAcknowledgements,
  Lists/RAAdmins) so the app's links to them always work.

  Permissions after the script:
    Site Members and Visitors   Read on all four lists
    Admins (-AdminEmails)       Contribute on RA Documents and RA Expected Signers
    Flow account (-FlowAccount) Contribute on RA Acknowledgements, Read on the rest
    Site Owners                 Full control (keep this group small)

.PARAMETER SiteUrl
  The SharePoint site to create the lists in, e.g. https://contoso.sharepoint.com/sites/ReadAck

.PARAMETER ClientId
  The Entra ID app registration PnP PowerShell signs in with. Create one once with:
    Register-PnPEntraIDAppForInteractiveLogin -ApplicationName "PnP PowerShell" -Tenant contoso.onmicrosoft.com

.PARAMETER AdminEmails
  Work email addresses of the people who will manage documents.

.PARAMETER FlowAccount
  The account that owns the two Power Automate flows (ideally a dedicated service account).

.EXAMPLE
  ./Create-ReadAckLists.ps1 -SiteUrl https://contoso.sharepoint.com/sites/ReadAck `
    -ClientId 00000000-0000-0000-0000-000000000000 `
    -AdminEmails jo.admin@contoso.com, sam.patel@contoso.com `
    -FlowAccount svc-readack@contoso.com
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)] [string] $SiteUrl,
  [Parameter(Mandatory)] [string] $ClientId,
  [Parameter(Mandatory)] [string[]] $AdminEmails,
  [Parameter(Mandatory)] [string] $FlowAccount
)

$ErrorActionPreference = 'Stop'
Import-Module PnP.PowerShell
Connect-PnPOnline -Url $SiteUrl -Interactive -ClientId $ClientId

$Documents = 'RA Documents'
$Signers = 'RA Expected Signers'
$Acks = 'RA Acknowledgements'
$Admins = 'RA Admins'

function Ensure-List([string] $Title, [string] $UrlName, [string] $TitleColumnName) {
  if (Get-PnPList -Identity $Title -ErrorAction SilentlyContinue) {
    Write-Host "List '$Title' already exists"
  } else {
    Write-Host "Creating list '$Title'"
    New-PnPList -Title $Title -Url "Lists/$UrlName" -Template GenericList -OnQuickLaunch:$false | Out-Null
  }
  # Version history keeps every change, so an edit made outside the app can still be traced.
  Set-PnPList -Identity $Title -EnableVersioning $true -MajorVersions 500 | Out-Null
  Set-PnPField -List $Title -Identity 'Title' -Values @{ Title = $TitleColumnName } | Out-Null
}

function Ensure-Field {
  param(
    [string] $List,
    [string] $Name,
    [string] $DisplayName,
    [string] $TypeAttributes,
    [string] $Default = '',
    [switch] $Required,
    [switch] $Indexed
  )
  if (-not (Get-PnPField -List $List -Identity $Name -ErrorAction SilentlyContinue)) {
    $req = if ($Required) { 'TRUE' } else { 'FALSE' }
    $inner = if ($Default) { "<Default>$Default</Default>" } else { '' }
    $xml = "<Field ID='{$([guid]::NewGuid())}' Name='$Name' StaticName='$Name' DisplayName='$DisplayName' Required='$req' $TypeAttributes>$inner</Field>"
    Add-PnPFieldFromXml -List $List -FieldXml $xml | Out-Null
    Write-Host "  added column $DisplayName"
  }
  if ($Indexed) {
    Set-PnPField -List $List -Identity $Name -Values @{ Indexed = $true } | Out-Null
  }
}

function Set-DefaultViewFields([string] $List, [string[]] $Fields) {
  $view = Get-PnPView -List $List | Where-Object { $_.DefaultView } | Select-Object -First 1
  Set-PnPView -List $List -Identity $view.Id -Fields $Fields | Out-Null
}

$text = "Type='Text' MaxLength='255'"
$note = "Type='Note' NumLines='6' RichText='FALSE'"
$number = "Type='Number' Decimals='0'"
$dateOnly = "Type='DateTime' Format='DateOnly'"
$dateTime = "Type='DateTime' Format='DateTime'"
$url = "Type='URL' Format='Hyperlink'"

# ---------- RA Documents ----------
Ensure-List $Documents 'RADocuments' 'Document name'
Ensure-Field $Documents 'Description' 'Description' $note
Ensure-Field $Documents 'VersionLabel' 'Version' $text
Ensure-Field $Documents 'DueDate' 'Due date' $dateOnly
Ensure-Field $Documents 'DocumentLink' 'Where the document is held' $url
Ensure-Field $Documents 'Status' 'Status' $text -Default 'Open' -Required -Indexed
Set-DefaultViewFields $Documents @('LinkTitle', 'VersionLabel', 'DueDate', 'Status', 'DocumentLink')

# ---------- RA Expected Signers ----------
Ensure-List $Signers 'RAExpectedSigners' 'Name'
Ensure-Field $Signers 'DocumentId' 'Document ID' $number -Required -Indexed
Ensure-Field $Signers 'SignerEmail' 'Email' $text -Required -Indexed
Set-DefaultViewFields $Signers @('LinkTitle', 'SignerEmail', 'DocumentId')

# ---------- RA Acknowledgements ----------
Ensure-List $Acks 'RAAcknowledgements' 'Name'
Ensure-Field $Acks 'SignerEmail' 'Email' $text -Required -Indexed
Ensure-Field $Acks 'DocumentId' 'Document ID' $number -Required -Indexed
Ensure-Field $Acks 'DocumentName' 'Document' $text -Required
Ensure-Field $Acks 'VersionLabel' 'Version' $text
Ensure-Field $Acks 'Statement' 'Statement' $note -Required
Ensure-Field $Acks 'AcknowledgedAt' 'Acknowledged at' $dateTime -Required -Indexed
Ensure-Field $Acks 'Client' 'Device and browser' $note
Ensure-Field $Acks 'Status' 'Status' $text -Default 'Valid' -Required -Indexed
Ensure-Field $Acks 'VoidedAt' 'Voided at' $dateTime
Ensure-Field $Acks 'VoidedBy' 'Voided by' $text
Ensure-Field $Acks 'VoidReason' 'Void reason' $note
Set-DefaultViewFields $Acks @('LinkTitle', 'SignerEmail', 'DocumentName', 'VersionLabel', 'AcknowledgedAt', 'Status', 'VoidedBy', 'VoidReason')

# ---------- RA Admins ----------
Ensure-List $Admins 'RAAdmins' 'Email'
$existingAdmins = @(Get-PnPListItem -List $Admins -PageSize 500 | ForEach-Object { "$($_.FieldValues.Title)".ToLower() })
foreach ($email in $AdminEmails) {
  $e = $email.Trim().ToLower()
  if ($existingAdmins -notcontains $e) {
    Add-PnPListItem -List $Admins -Values @{ Title = $e } | Out-Null
    Write-Host "  added admin $e"
  }
}

# ---------- Permissions ----------
function Set-ListAccess([string] $List, [string[]] $Contributors, [string[]] $Readers) {
  Set-PnPList -Identity $List -BreakRoleInheritance -CopyRoleAssignments | Out-Null
  $members = Get-PnPGroup -AssociatedMemberGroup
  try {
    Set-PnPListPermission -Identity $List -Group $members -RemoveRole 'Edit' | Out-Null
  } catch {
    # Members didn't have Edit on this list (e.g. a second run).
  }
  Set-PnPListPermission -Identity $List -Group $members -AddRole 'Read' | Out-Null
  foreach ($user in $Contributors) {
    Set-PnPListPermission -Identity $List -User $user -AddRole 'Contribute' | Out-Null
  }
  foreach ($user in $Readers) {
    Set-PnPListPermission -Identity $List -User $user -AddRole 'Read' | Out-Null
  }
  Write-Host "Permissions set on '$List'"
}

Set-ListAccess $Documents -Contributors $AdminEmails -Readers @($FlowAccount)
Set-ListAccess $Signers -Contributors $AdminEmails -Readers @($FlowAccount)
# Only the flow account writes acknowledgements; admins void them through the void flow.
Set-ListAccess $Acks -Contributors @($FlowAccount) -Readers @()
Set-ListAccess $Admins -Contributors @() -Readers @($FlowAccount)

Write-Host ''
Write-Host 'Done. Next: build the two Power Automate flows (docs/2-power-automate-flows.md).'
