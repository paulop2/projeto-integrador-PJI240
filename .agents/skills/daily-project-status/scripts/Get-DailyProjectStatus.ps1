[CmdletBinding()]
param(
    [Parameter()]
    [ValidatePattern('^[^/\s]+/[^/\s]+$')]
    [string]$Repository,

    [Parameter()]
    [ValidateRange(1, [int]::MaxValue)]
    [int]$ProjectNumber,

    [Parameter()]
    [string]$ProjectOwner,

    [Parameter()]
    [ValidateRange(1, 1000)]
    [int]$ProjectItemLimit = 1000,

    [Parameter()]
    [switch]$Compact
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-Command {
    param([Parameter(Mandatory = $true)][string]$Name)

    if ($null -eq (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command '$Name' was not found on PATH."
    }
}

function Invoke-GhJson {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)

    $output = @(& gh @Arguments)
    if ($LASTEXITCODE -ne 0) {
        throw "gh command failed: gh $($Arguments -join ' ')"
    }

    $text = $output -join [Environment]::NewLine
    if ([string]::IsNullOrWhiteSpace($text)) {
        return $null
    }
    return ($text | ConvertFrom-Json)
}

function Invoke-GitText {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)

    $output = @(& git @Arguments)
    if ($LASTEXITCODE -ne 0) {
        throw "git command failed: git $($Arguments -join ' ')"
    }
    return ($output -join [Environment]::NewLine).Trim()
}

function Get-PropertyValue {
    param(
        [AllowNull()][object]$InputObject,
        [Parameter(Mandatory = $true)][string]$Name
    )

    if ($null -eq $InputObject) {
        return $null
    }
    $property = $InputObject.PSObject.Properties[$Name]
    if ($null -eq $property) {
        return $null
    }
    return $property.Value
}

function Get-ProjectOwnerFromUrl {
    param([Parameter(Mandatory = $true)][string]$Url)

    if ($Url -match '^https://github\.com/(?:users|orgs)/(?<owner>[^/]+)/projects/\d+$') {
        return $Matches['owner']
    }
    return $null
}

function Get-ProjectSnapshot {
    param(
        [Parameter(Mandatory = $true)][int]$Number,
        [Parameter(Mandatory = $true)][string]$Owner,
        [Parameter(Mandatory = $true)][int]$Limit
    )

    return Invoke-GhJson -Arguments @(
        'project', 'item-list', [string]$Number,
        '--owner', $Owner,
        '--limit', [string]$Limit,
        '--format', 'json'
    )
}

function ConvertFrom-WorktreePorcelain {
    param([string[]]$Lines)

    $result = @()
    $current = $null
    foreach ($line in @($Lines) + '') {
        if ([string]::IsNullOrWhiteSpace($line)) {
            if ($null -ne $current) {
                $result += [pscustomobject]$current
                $current = $null
            }
            continue
        }
        if ($line -match '^worktree (.+)$') {
            if ($null -ne $current) {
                $result += [pscustomobject]$current
            }
            $current = [ordered]@{ path = $Matches[1] }
        }
        elseif ($null -ne $current -and $line -match '^branch refs/heads/(.+)$') {
            $current.branch = $Matches[1]
        }
    }
    return $result
}

function Test-ClosingReference {
    param(
        [Parameter(Mandatory = $true)][object]$Reference,
        [Parameter(Mandatory = $true)][string]$TargetRepository,
        [Parameter(Mandatory = $true)][int]$TargetIssue
    )

    $referenceRepository = Get-PropertyValue -InputObject $Reference -Name 'repository'
    $referenceOwner = Get-PropertyValue -InputObject $referenceRepository -Name 'owner'
    $referenceName = "$(Get-PropertyValue -InputObject $referenceOwner -Name 'login')/$(Get-PropertyValue -InputObject $referenceRepository -Name 'name')"
    return ([int](Get-PropertyValue -InputObject $Reference -Name 'number') -eq $TargetIssue -and
        $referenceName.Equals($TargetRepository, [System.StringComparison]::OrdinalIgnoreCase))
}

Assert-Command -Name 'git'
Assert-Command -Name 'gh'

$repoRoot = Invoke-GitText -Arguments @('rev-parse', '--show-toplevel')
$repoInfo = Invoke-GhJson -Arguments @('repo', 'view', '--json', 'nameWithOwner,owner,projectsV2')
$localRepository = [string]$repoInfo.nameWithOwner
if ([string]::IsNullOrWhiteSpace($Repository)) {
    $Repository = $localRepository
}
elseif (-not $Repository.Equals($localRepository, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Current checkout '$repoRoot' belongs to '$localRepository', not requested repository '$Repository'."
}

$repoParts = $Repository.Split('/', 2)
$repoOwner = $repoParts[0]
$repoName = $repoParts[1]
$warnings = @()
$linkedProjects = @($repoInfo.projectsV2.nodes | Where-Object { -not $_.closed })
$selectedProject = $null
$projectSnapshot = $null

if ($ProjectNumber -gt 0) {
    $selectedProject = @($linkedProjects | Where-Object { [int]$_.number -eq $ProjectNumber } | Select-Object -First 1)
    if ([string]::IsNullOrWhiteSpace($ProjectOwner)) {
        if ($selectedProject.Count -gt 0) {
            $ProjectOwner = Get-ProjectOwnerFromUrl -Url ([string]$selectedProject[0].url)
        }
        if ([string]::IsNullOrWhiteSpace($ProjectOwner)) {
            $ProjectOwner = $repoOwner
        }
    }
    $projectSnapshot = Get-ProjectSnapshot -Number $ProjectNumber -Owner $ProjectOwner -Limit $ProjectItemLimit
    if ($selectedProject.Count -eq 0) {
        $selectedProject = @(Invoke-GhJson -Arguments @('project', 'view', [string]$ProjectNumber, '--owner', $ProjectOwner, '--format', 'json'))
    }
}
else {
    $candidates = @()
    foreach ($project in $linkedProjects) {
        $owner = Get-ProjectOwnerFromUrl -Url ([string]$project.url)
        if ([string]::IsNullOrWhiteSpace($owner)) {
            continue
        }
        try {
            $snapshot = Get-ProjectSnapshot -Number ([int]$project.number) -Owner $owner -Limit $ProjectItemLimit
            $repositoryItems = @($snapshot.items | Where-Object {
                $content = Get-PropertyValue -InputObject $_ -Name 'content'
                (Get-PropertyValue -InputObject $content -Name 'repository') -eq $Repository
            })
            if ($repositoryItems.Count -gt 0) {
                $candidates += [pscustomobject]@{ project = $project; owner = $owner; snapshot = $snapshot }
            }
        }
        catch {
            $warnings += "Could not inspect linked Project #$($project.number): $($_.Exception.Message)"
        }
    }
    if ($candidates.Count -ne 1) {
        $candidateNames = @($candidates | ForEach-Object { "#$($_.project.number) $($_.project.title)" }) -join ', '
        throw "Could not select exactly one Project containing this repository. Candidates: $candidateNames. Pass -ProjectNumber and -ProjectOwner."
    }
    $selectedProject = @($candidates[0].project)
    $ProjectOwner = [string]$candidates[0].owner
    $ProjectNumber = [int]$candidates[0].project.number
    $projectSnapshot = $candidates[0].snapshot
}

$project = $selectedProject[0]
$loadedProjectItems = @($projectSnapshot.items)
$projectTotalCount = Get-PropertyValue -InputObject $projectSnapshot -Name 'totalCount'
if ($null -ne $projectTotalCount -and [int]$projectTotalCount -gt $loadedProjectItems.Count) {
    $warnings += "Project snapshot is truncated: loaded $($loadedProjectItems.Count) of $projectTotalCount items."
}

$projectItems = @($loadedProjectItems | Where-Object {
    $content = Get-PropertyValue -InputObject $_ -Name 'content'
    (Get-PropertyValue -InputObject $content -Name 'type') -eq 'Issue' -and
        (Get-PropertyValue -InputObject $content -Name 'repository') -eq $Repository
})
$projectIndex = @{}
foreach ($item in $projectItems) {
    $content = Get-PropertyValue -InputObject $item -Name 'content'
    $number = Get-PropertyValue -InputObject $content -Name 'number'
    if ($null -ne $number) {
        $projectIndex[[string]$number] = $item
    }
}

$issuesQuery = @'
query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    issues(first: 100, states: OPEN, orderBy: {field: UPDATED_AT, direction: DESC}) {
      nodes {
        number title url body updatedAt
        labels(first: 20) { nodes { name } }
        assignees(first: 10) { nodes { login } }
        milestone { title dueOn }
        parent { number title }
        blockedBy(first: 50) { nodes { number title state url } }
        blocking(first: 50) { nodes { number title state url } }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}
'@
$issuesResponse = Invoke-GhJson -Arguments @(
    'api', 'graphql',
    '-f', "query=$issuesQuery",
    '-f', "owner=$repoOwner",
    '-f', "name=$repoName"
)
$openIssuesConnection = $issuesResponse.data.repository.issues
if ($openIssuesConnection.pageInfo.hasNextPage) {
    $warnings += "Open issues are truncated after 100 items at cursor '$($openIssuesConnection.pageInfo.endCursor)'."
}

$openPullRequests = @(Invoke-GhJson -Arguments @(
    'pr', 'list', '-R', $Repository,
    '--state', 'open', '--limit', '1000',
    '--json', 'number,title,url,isDraft,headRefName,baseRefName,updatedAt,closingIssuesReferences'
))
$worktreeLines = @(& git worktree list --porcelain)
if ($LASTEXITCODE -ne 0) {
    throw 'git worktree list failed.'
}
$worktrees = @(ConvertFrom-WorktreePorcelain -Lines $worktreeLines)

$issues = @()
$groups = [ordered]@{
    dispatchable = @()
    active = @()
    review = @()
    blocked = @()
    backlog = @()
    epics = @()
}
$dependencyEdges = @()

foreach ($issue in @($openIssuesConnection.nodes)) {
    $key = [string]$issue.number
    if (-not $projectIndex.ContainsKey($key)) {
        continue
    }
    $item = $projectIndex[$key]
    $openBlockers = @($issue.blockedBy.nodes | Where-Object { $_.state -eq 'OPEN' })
    foreach ($blocker in $openBlockers) {
        $dependencyEdges += [pscustomobject][ordered]@{ from = $blocker.number; to = $issue.number }
    }
    $matchingPullRequests = @($openPullRequests | Where-Object {
        $pullRequest = $_
        @($pullRequest.closingIssuesReferences | Where-Object {
            Test-ClosingReference -Reference $_ -TargetRepository $Repository -TargetIssue ([int]$issue.number)
        }).Count -gt 0
    })
    $matchingWorktrees = @($worktrees | Where-Object {
        $branch = [string](Get-PropertyValue -InputObject $_ -Name 'branch')
        $branch -match '^(?:feat|fix|bug|chore|docs|test|refactor|task)/(?<number>\d+)(?:[-_]|$)' -and
            [int]$Matches['number'] -eq [int]$issue.number
    })
    $labels = @($issue.labels.nodes | ForEach-Object { $_.name })
    $status = [string](Get-PropertyValue -InputObject $item -Name 'status')
    $kind = [string](Get-PropertyValue -InputObject $item -Name 'kind')
    $isEpic = $kind -eq 'Epic' -or $labels -contains 'epic'

    if ($isEpic) {
        $group = 'epics'
    }
    elseif ($matchingPullRequests.Count -gt 0 -or $status -eq 'Review') {
        $group = 'review'
    }
    elseif ($openBlockers.Count -gt 0 -or $status -eq 'Blocked') {
        $group = 'blocked'
    }
    elseif ($matchingWorktrees.Count -gt 0 -or $status -eq 'In Progress') {
        $group = 'active'
    }
    elseif ($status -eq 'Ready') {
        $group = 'dispatchable'
    }
    else {
        $group = 'backlog'
    }

    if ($status -eq 'Ready' -and $openBlockers.Count -gt 0) {
        $warnings += "Issue #$($issue.number) is Ready in Project but has open blockers."
    }
    if ($status -eq 'Done') {
        $warnings += "Issue #$($issue.number) is open but marked Done in Project."
    }

    $issueRecord = [pscustomobject][ordered]@{
        number = $issue.number
        title = $issue.title
        url = $issue.url
        group = $group
        status = $status
        kind = $kind
        priority = Get-PropertyValue -InputObject $item -Name 'priority'
        area = Get-PropertyValue -InputObject $item -Name 'area'
        effort = Get-PropertyValue -InputObject $item -Name 'effort'
        parent = $issue.parent
        milestone = $issue.milestone
        assignees = @($issue.assignees.nodes | ForEach-Object { $_.login })
        updatedAt = $issue.updatedAt
        openBlockers = $openBlockers
        blockingOpenIssues = @($issue.blocking.nodes | Where-Object { $_.state -eq 'OPEN' })
        openPullRequests = @($matchingPullRequests | Select-Object number, title, url, isDraft, headRefName, baseRefName, updatedAt)
        worktrees = @($matchingWorktrees)
        body = if ($isEpic) { $null } else { $issue.body }
    }
    $issues += $issueRecord
}

$priorityOrder = @{ P0 = 0; P1 = 1; P2 = 2; P3 = 3 }
$issues = @($issues | Sort-Object `
    @{ Expression = { if ($priorityOrder.ContainsKey([string]$_.priority)) { $priorityOrder[[string]$_.priority] } else { 99 } } },
    @{ Expression = { if ($null -ne $_.milestone) { $_.milestone.dueOn } } },
    @{ Expression = { $_.number } })
foreach ($issue in $issues) {
    $groups[$issue.group] += $issue.number
}

$result = [ordered]@{
    schemaVersion = 1
    capturedAt = (Get-Date).ToUniversalTime().ToString('o')
    repository = $Repository
    project = [ordered]@{
        number = $ProjectNumber
        title = $project.title
        owner = $ProjectOwner
        url = $project.url
        totalCount = $projectTotalCount
        loadedCount = $loadedProjectItems.Count
    }
    groups = $groups
    dependencyEdges = $dependencyEdges
    issues = $issues
    localGit = [ordered]@{
        root = $repoRoot
        branch = Invoke-GitText -Arguments @('branch', '--show-current')
        head = Invoke-GitText -Arguments @('rev-parse', 'HEAD')
        dirty = (@(& git status --porcelain=v1).Count -gt 0)
        worktrees = $worktrees
    }
    warnings = $warnings
}

if ($Compact.IsPresent) {
    $result | ConvertTo-Json -Depth 20 -Compress
}
else {
    $result | ConvertTo-Json -Depth 20
}
