[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateRange(1, [int]::MaxValue)]
    [int]$IssueNumber,

    [Parameter()]
    [ValidatePattern('^[^/\s]+/[^/\s]+$')]
    [string]$Repository,

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

function Invoke-GhPaginatedJson {
    param(
        [Parameter(Mandatory = $true)][string]$Endpoint,
        [string[]]$Headers = @()
    )

    $arguments = @('api', $Endpoint, '--paginate', '--slurp')
    foreach ($header in $Headers) {
        $arguments += @('-H', $header)
    }

    $output = @(& gh @arguments)
    if ($LASTEXITCODE -ne 0) {
        throw "gh paginated API command failed for '$Endpoint'."
    }

    $text = $output -join [Environment]::NewLine
    if ([string]::IsNullOrWhiteSpace($text)) {
        return @()
    }

    $pages = $text | ConvertFrom-Json
    $items = @()
    foreach ($page in @($pages)) {
        $items += @($page)
    }
    return $items
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
            continue
        }

        if ($null -eq $current) {
            continue
        }

        if ($line -match '^HEAD (.+)$') {
            $current.head = $Matches[1]
        }
        elseif ($line -match '^branch refs/heads/(.+)$') {
            $current.branch = $Matches[1]
        }
        elseif ($line -eq 'detached') {
            $current.detached = $true
        }
        elseif ($line -match '^locked(?: (.*))?$') {
            $current.locked = $true
            $current.lockReason = $Matches[1]
        }
        elseif ($line -match '^prunable(?: (.*))?$') {
            $current.prunable = $true
            $current.pruneReason = $Matches[1]
        }
    }

    return $result
}

function Add-PullRequestReference {
    param(
        [Parameter(Mandatory = $true)][hashtable]$Index,
        [AllowNull()][object]$PullRequest,
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)]
        [ValidateSet('closing', 'crossReference', 'projectLink')]
        [string]$RelationshipKind
    )

    if ($null -eq $PullRequest) {
        return
    }

    $pullRequestMarker = Get-PropertyValue -InputObject $PullRequest -Name 'pull_request'
    $url = Get-PropertyValue -InputObject $pullRequestMarker -Name 'html_url'
    if ([string]::IsNullOrWhiteSpace([string]$url)) {
        $url = Get-PropertyValue -InputObject $PullRequest -Name 'html_url'
    }
    if ([string]::IsNullOrWhiteSpace([string]$url)) {
        $url = Get-PropertyValue -InputObject $PullRequest -Name 'url'
    }
    if ([string]::IsNullOrWhiteSpace([string]$url)) {
        return
    }

    $repositoryValue = Get-PropertyValue -InputObject $PullRequest -Name 'repository'
    $repositoryName = Get-PropertyValue -InputObject $repositoryValue -Name 'nameWithOwner'
    if ([string]::IsNullOrWhiteSpace([string]$repositoryName)) {
        $repositoryName = Get-PropertyValue -InputObject $repositoryValue -Name 'full_name'
    }
    if ([string]::IsNullOrWhiteSpace([string]$repositoryName)) {
        $repositoryOwner = Get-PropertyValue -InputObject $repositoryValue -Name 'owner'
        $repositoryOwnerLogin = Get-PropertyValue -InputObject $repositoryOwner -Name 'login'
        $repositoryShortName = Get-PropertyValue -InputObject $repositoryValue -Name 'name'
        if (-not [string]::IsNullOrWhiteSpace([string]$repositoryOwnerLogin) -and
            -not [string]::IsNullOrWhiteSpace([string]$repositoryShortName)) {
            $repositoryName = "$repositoryOwnerLogin/$repositoryShortName"
        }
    }

    $key = ([string]$url).ToLowerInvariant()
    if (-not $Index.ContainsKey($key)) {
        $Index[$key] = [ordered]@{
            number = Get-PropertyValue -InputObject $PullRequest -Name 'number'
            title = Get-PropertyValue -InputObject $PullRequest -Name 'title'
            state = Get-PropertyValue -InputObject $PullRequest -Name 'state'
            isDraft = Get-PropertyValue -InputObject $PullRequest -Name 'isDraft'
            mergedAt = Get-PropertyValue -InputObject $PullRequest -Name 'mergedAt'
            baseRefName = Get-PropertyValue -InputObject $PullRequest -Name 'baseRefName'
            headRefName = Get-PropertyValue -InputObject $PullRequest -Name 'headRefName'
            repository = $repositoryName
            url = $url
            sources = @($Source)
            relationshipKinds = @($RelationshipKind)
            closesIssue = $false
            closingIssues = @()
        }
        return
    }

    if ($Index[$key].sources -notcontains $Source) {
        $Index[$key].sources += $Source
    }
    if ($Index[$key].relationshipKinds -notcontains $RelationshipKind) {
        $Index[$key].relationshipKinds += $RelationshipKind
    }
}

Assert-Command -Name 'git'
Assert-Command -Name 'gh'

$repoRoot = Invoke-GitText -Arguments @('rev-parse', '--show-toplevel')
$localRepoInfo = Invoke-GhJson -Arguments @('repo', 'view', '--json', 'nameWithOwner,url')
$localRepository = [string]$localRepoInfo.nameWithOwner

if ([string]::IsNullOrWhiteSpace($Repository)) {
    $Repository = $localRepository
}
elseif (-not $Repository.Equals($localRepository, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Current checkout '$repoRoot' belongs to '$localRepository', not requested repository '$Repository'. Run this script from a checkout of the requested repository."
}

$repoParts = $Repository.Split('/', 2)
$repoOwner = $repoParts[0]
$repoName = $repoParts[1]
$warnings = @()

$issue = Invoke-GhJson -Arguments @(
    'issue', 'view', [string]$IssueNumber,
    '-R', $Repository,
    '--json', 'number,title,state,url,body,labels,assignees,milestone,projectItems,comments,closedAt,closedByPullRequestsReferences'
)

$relationshipQuery = @'
query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    issue(number: $number) {
      parent {
        number title state url body
        labels(first: 50) { nodes { name } }
        milestone { number title dueOn }
      }
      blockedBy(first: 100) {
        nodes {
          number title state url body
          labels(first: 50) { nodes { name } }
          milestone { number title dueOn }
        }
      }
      blocking(first: 100) { nodes { number title state url } }
      subIssues(first: 100) { nodes { number title state url } }
      projectItems(first: 100) {
        nodes {
          id
          project {
            id
            number
            title
            url
            owner {
              ... on User { login }
              ... on Organization { login }
            }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}
'@

$relationshipResponse = Invoke-GhJson -Arguments @(
    'api', 'graphql',
    '-f', "query=$relationshipQuery",
    '-f', "owner=$repoOwner",
    '-f', "name=$repoName",
    '-F', "number=$IssueNumber"
)
$relationships = $relationshipResponse.data.repository.issue

if ($relationships.projectItems.pageInfo.hasNextPage) {
    $warnings += "Issue belongs to more than 100 Projects; Project membership is incomplete after cursor '$($relationships.projectItems.pageInfo.endCursor)'. Query the remaining memberships directly with gh."
}

$projectDetails = @()
foreach ($projectNode in @($relationships.projectItems.nodes)) {
    $project = $projectNode.project
    $projectOwner = [string]$project.owner.login

    try {
        $projectList = Invoke-GhJson -Arguments @(
            'project', 'item-list', [string]$project.number,
            '--owner', $projectOwner,
            '--limit', [string]$ProjectItemLimit,
            '--format', 'json'
        )

        $loadedItems = @($projectList.items)
        $matchingItems = @($loadedItems | Where-Object {
            $content = Get-PropertyValue -InputObject $_ -Name 'content'
            $contentNumber = Get-PropertyValue -InputObject $content -Name 'number'
            $contentRepository = Get-PropertyValue -InputObject $content -Name 'repository'
            ([int]$contentNumber -eq $IssueNumber) -and
                ([string]::IsNullOrWhiteSpace([string]$contentRepository) -or $contentRepository -eq $Repository)
        })

        $lookupError = $null
        if ($matchingItems.Count -eq 0) {
            $totalCount = Get-PropertyValue -InputObject $projectList -Name 'totalCount'
            $lookupError = "Project '$($project.title)' reports this issue as a member, but its item was not found among $($loadedItems.Count) loaded item(s)"
            if ($null -ne $totalCount) {
                $lookupError += " out of $totalCount"
            }
            $lookupError += '. Query the item directly with gh.'
            $warnings += $lookupError
        }

        $projectDetails += [pscustomobject][ordered]@{
            id = $project.id
            number = $project.number
            title = $project.title
            owner = $projectOwner
            url = $project.url
            item = if ($matchingItems.Count -gt 0) { $matchingItems[0] } else { $null }
            lookupError = $lookupError
        }
    }
    catch {
        $message = "Could not read Project '$($project.title)' (#$($project.number)): $($_.Exception.Message)"
        $warnings += $message
        $projectDetails += [pscustomobject][ordered]@{
            id = $project.id
            number = $project.number
            title = $project.title
            owner = $projectOwner
            url = $project.url
            item = $null
            lookupError = $message
        }
    }
}

$timeline = @()
try {
    $timeline = @(Invoke-GhPaginatedJson `
        -Endpoint "repos/$Repository/issues/$IssueNumber/timeline?per_page=100" `
        -Headers @('Accept: application/vnd.github+json'))
}
catch {
    $warnings += "Could not read issue timeline: $($_.Exception.Message)"
}

$pullRequestIndex = @{}
foreach ($pullRequest in @($issue.closedByPullRequestsReferences)) {
    Add-PullRequestReference -Index $pullRequestIndex -PullRequest $pullRequest -Source 'closedByPullRequestsReferences' -RelationshipKind 'closing'
}

foreach ($timelineEvent in $timeline) {
    $source = Get-PropertyValue -InputObject $timelineEvent -Name 'source'
    $sourceIssue = Get-PropertyValue -InputObject $source -Name 'issue'
    $sourcePullRequestMarker = Get-PropertyValue -InputObject $sourceIssue -Name 'pull_request'
    if ($null -ne $sourcePullRequestMarker) {
        Add-PullRequestReference -Index $pullRequestIndex -PullRequest $sourceIssue -Source 'timeline' -RelationshipKind 'crossReference'
    }

    $subject = Get-PropertyValue -InputObject $timelineEvent -Name 'subject'
    $subjectPullRequestMarker = Get-PropertyValue -InputObject $subject -Name 'pull_request'
    if ($null -ne $subjectPullRequestMarker) {
        Add-PullRequestReference -Index $pullRequestIndex -PullRequest $subject -Source 'timeline' -RelationshipKind 'crossReference'
    }
}

foreach ($projectDetail in $projectDetails) {
    if ($null -eq $projectDetail.item) {
        continue
    }

    $projectPullRequests = Get-PropertyValue -InputObject $projectDetail.item -Name 'linked pull requests'
    foreach ($linkedValue in @($projectPullRequests)) {
        if ($linkedValue -is [string]) {
            if ($linkedValue -match 'https://github\.com/[^/]+/[^/]+/pull/\d+') {
                Add-PullRequestReference -Index $pullRequestIndex -PullRequest ([pscustomobject]@{ url = $Matches[0] }) -Source 'project' -RelationshipKind 'projectLink'
            }
        }
        else {
            Add-PullRequestReference -Index $pullRequestIndex -PullRequest $linkedValue -Source 'project' -RelationshipKind 'projectLink'
        }
    }
}

foreach ($pullRequestKey in @($pullRequestIndex.Keys)) {
    $pullRequestReference = $pullRequestIndex[$pullRequestKey]
    if ($pullRequestReference.url -notmatch '^https://github\.com/(?<repo>[^/]+/[^/]+)/pull/(?<number>\d+)$') {
        continue
    }

    try {
        $pullRequestDetails = Invoke-GhJson -Arguments @(
            'pr', 'view', $Matches['number'],
            '-R', $Matches['repo'],
            '--json', 'number,title,state,url,isDraft,mergedAt,baseRefName,headRefName,closingIssuesReferences'
        )
        $pullRequestReference.number = $pullRequestDetails.number
        $pullRequestReference.title = $pullRequestDetails.title
        $pullRequestReference.state = $pullRequestDetails.state
        $pullRequestReference.isDraft = $pullRequestDetails.isDraft
        $pullRequestReference.mergedAt = $pullRequestDetails.mergedAt
        $pullRequestReference.baseRefName = $pullRequestDetails.baseRefName
        $pullRequestReference.headRefName = $pullRequestDetails.headRefName
        $pullRequestReference.repository = $Matches['repo']
        $pullRequestReference.url = $pullRequestDetails.url
        $pullRequestReference.closingIssues = @($pullRequestDetails.closingIssuesReferences | ForEach-Object {
            $closingRepository = Get-PropertyValue -InputObject $_ -Name 'repository'
            $closingOwner = Get-PropertyValue -InputObject $closingRepository -Name 'owner'
            [pscustomobject][ordered]@{
                repository = "$(Get-PropertyValue -InputObject $closingOwner -Name 'login')/$(Get-PropertyValue -InputObject $closingRepository -Name 'name')"
                number = Get-PropertyValue -InputObject $_ -Name 'number'
                url = Get-PropertyValue -InputObject $_ -Name 'url'
            }
        })
        $pullRequestReference.closesIssue = @($pullRequestReference.closingIssues | Where-Object {
            $_.number -eq $IssueNumber -and $_.repository -eq $Repository
        }).Count -gt 0
        if ($pullRequestReference.closesIssue -and $pullRequestReference.relationshipKinds -notcontains 'closing') {
            $pullRequestReference.relationshipKinds += 'closing'
        }
    }
    catch {
        $warnings += "Could not enrich linked PR '$($pullRequestReference.url)': $($_.Exception.Message)"
    }
}

$commentItems = @($issue.comments)
try {
    $commentItems = @(Invoke-GhPaginatedJson `
        -Endpoint "repos/$Repository/issues/$IssueNumber/comments?per_page=100" `
        -Headers @('Accept: application/vnd.github+json'))
}
catch {
    $warnings += "Could not read all issue comments; using gh issue view fallback: $($_.Exception.Message)"
}

$comments = @($commentItems | ForEach-Object {
    $authorObject = Get-PropertyValue -InputObject $_ -Name 'author'
    if ($null -eq $authorObject) {
        $authorObject = Get-PropertyValue -InputObject $_ -Name 'user'
    }

    $createdAt = Get-PropertyValue -InputObject $_ -Name 'createdAt'
    if ($null -eq $createdAt) {
        $createdAt = Get-PropertyValue -InputObject $_ -Name 'created_at'
    }
    $updatedAt = Get-PropertyValue -InputObject $_ -Name 'updatedAt'
    if ($null -eq $updatedAt) {
        $updatedAt = Get-PropertyValue -InputObject $_ -Name 'updated_at'
    }
    $url = Get-PropertyValue -InputObject $_ -Name 'url'
    $htmlUrl = Get-PropertyValue -InputObject $_ -Name 'html_url'
    if (-not [string]::IsNullOrWhiteSpace([string]$htmlUrl)) {
        $url = $htmlUrl
    }

    [pscustomobject][ordered]@{
        author = Get-PropertyValue -InputObject $authorObject -Name 'login'
        createdAt = $createdAt
        updatedAt = $updatedAt
        url = $url
        body = Get-PropertyValue -InputObject $_ -Name 'body'
    }
})

$handoffPattern = '(?im)\bhandoff\b|\bestado atual\b|\bpr[o\u00f3]xima a[c\u00e7][a\u00e3]o\b|\bretomada\b'
$handoffs = @($comments | Where-Object { $_.body -match $handoffPattern })

$statusLines = @(& git status --porcelain=v1)
if ($LASTEXITCODE -ne 0) {
    throw 'git status failed.'
}
$worktreeLines = @(& git worktree list --porcelain)
if ($LASTEXITCODE -ne 0) {
    throw 'git worktree list failed.'
}

$pullRequests = @($pullRequestIndex.Values | Sort-Object repository, number)
$result = [ordered]@{
    schemaVersion = 2
    capturedAt = (Get-Date).ToUniversalTime().ToString('o')
    repository = $Repository
    issue = [ordered]@{
        number = $issue.number
        title = $issue.title
        state = $issue.state
        url = $issue.url
        body = $issue.body
        closedAt = $issue.closedAt
        labels = @($issue.labels)
        assignees = @($issue.assignees)
        milestone = $issue.milestone
    }
    relationships = [ordered]@{
        parent = $relationships.parent
        blockedBy = @($relationships.blockedBy.nodes)
        blocking = @($relationships.blocking.nodes)
        subIssues = @($relationships.subIssues.nodes)
    }
    projects = $projectDetails
    comments = $comments
    handoffs = $handoffs
    pullRequests = [ordered]@{
        closing = @($pullRequests | Where-Object { $_.closesIssue })
        crossReferences = @($pullRequests | Where-Object { -not $_.closesIssue })
    }
    localGit = [ordered]@{
        root = $repoRoot
        repository = $localRepository
        branch = Invoke-GitText -Arguments @('branch', '--show-current')
        head = Invoke-GitText -Arguments @('rev-parse', 'HEAD')
        origin = Invoke-GitText -Arguments @('remote', 'get-url', 'origin')
        dirty = ($statusLines.Count -gt 0)
        status = $statusLines
        worktrees = @(ConvertFrom-WorktreePorcelain -Lines $worktreeLines)
    }
    warnings = $warnings
}

if ($Compact.IsPresent) {
    $result | ConvertTo-Json -Depth 20 -Compress
}
else {
    $result | ConvertTo-Json -Depth 20
}
