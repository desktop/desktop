//! Repository- and actor-bound GitHub branch rules, using Desktop's pinned matcher.
use crate::{Repository, RepositoryIdentity, cancellation};
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    time::{Duration, Instant},
};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct NameRulesActor {
    pub id: u64,
    pub login: String,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct NameRuleFailure {
    pub ruleset_id: u64,
    pub description: String,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct NameRulesPolicy {
    pub basis: String,
    pub branch: String,
    pub status: String,
    pub result: String,
    pub reason: Option<String>,
    pub repository: Option<RepositoryIdentity>,
    pub actor: Option<NameRulesActor>,
    pub creation_restricted: String,
    pub failed: Vec<NameRuleFailure>,
    pub bypassed: Vec<NameRuleFailure>,
}
impl NameRulesPolicy {
    pub(crate) fn ensure_allowed(&self) -> Result<()> {
        anyhow::ensure!(
            self.result != "blocked",
            "{}",
            self.reason
                .as_deref()
                .unwrap_or("Branch name is restricted by repository rules")
        );
        Ok(())
    }
    fn new(branch: &str) -> Self {
        Self {
            basis: String::new(),
            branch: branch.into(),
            status: "skipped".into(),
            result: "not_checked".into(),
            reason: None,
            repository: None,
            actor: None,
            creation_restricted: "none".into(),
            failed: vec![],
            bypassed: vec![],
        }
    }
}
fn fingerprint(value: &impl Serialize) -> Result<String> {
    Ok(format!("{:x}", Sha256::digest(serde_json::to_vec(value)?)))
}
fn bind_policy(
    context_basis: &str,
    mut policy: NameRulesPolicy,
    witness: Value,
) -> Result<NameRulesPolicy> {
    policy.basis = fingerprint(&(context_basis, &policy, witness))?;
    Ok(policy)
}
fn supported_host(host: &str) -> bool {
    // Match Desktop's dotcom capability, including data-residency endpoints.
    let hostname = host.split(':').next().unwrap_or(host);
    hostname == "github.com" || (hostname.ends_with(".ghe.com") && hostname.len() > 8)
}
fn description(parameters: &Value) -> String {
    let prefix = if parameters["negate"] == true {
        "must not "
    } else {
        "must "
    };
    let pattern = parameters["pattern"].as_str().unwrap_or_default();
    let operation = match parameters["operator"].as_str() {
        Some("starts_with") => "start with ",
        Some("ends_with") => "end with ",
        Some("contains") => "contain ",
        Some("regex") => "match the regular expression ",
        _ => "",
    };
    format!("{prefix}{operation}\"{pattern}\"")
}
fn validate_parameters(value: &Value) -> Result<()> {
    anyhow::ensure!(value.is_object(), "Invalid branch-name rule parameters");
    anyhow::ensure!(
        value["operator"].as_str().is_some_and(|v| v.len() <= 64)
            && value["pattern"].as_str().is_some_and(|v| v.len() <= 8192)
            && value.get("negate").is_none_or(Value::is_boolean),
        "Invalid or oversized branch-name rule parameters"
    );
    Ok(())
}
fn match_rules(parameters: Vec<Value>, branch: String) -> Result<Vec<bool>> {
    if parameters.is_empty() {
        return Ok(vec![]);
    }
    let input = serde_json::to_string(&parameters)?;
    anyhow::ensure!(
        input.len() <= 1024 * 1024,
        "Branch-name patterns exceed the evaluation limit"
    );
    let runtime = rquickjs::Runtime::new()
        .map_err(|_| anyhow::anyhow!("Cannot initialize branch-name matcher"))?;
    runtime.set_memory_limit(64 * 1024 * 1024);
    runtime.set_max_stack_size(1024 * 1024);
    let token = cancellation::Cancellation::current();
    let check = token.clone();
    let deadline = Instant::now() + Duration::from_secs(5);
    runtime.set_interrupt_handler(Some(Box::new(move || {
        check.is_cancelled() || Instant::now() >= deadline
    })));
    let context = rquickjs::Context::full(&runtime)
        .map_err(|_| anyhow::anyhow!("Cannot initialize branch-name matcher context"))?;
    let output = context.with(|context| -> rquickjs::Result<String> {
        context.eval::<(), _>(include_str!("repo_rules/re2js.js"))?;
        let matcher: rquickjs::Function = context.globals().get("__desktopMatchRules")?;
        matcher.call((input, branch))
    });
    token.check()?;
    let output = output.map_err(|_| {
        anyhow::anyhow!("Branch-name matcher rejected a pattern or exceeded its resource limit")
    })?;
    let matched: Vec<bool> =
        serde_json::from_str(&output).context("Invalid branch-name matcher result")?;
    anyhow::ensure!(
        matched.len() == parameters.len(),
        "Incomplete branch-name matcher result"
    );
    Ok(matched)
}

/// Preserve the legacy checker's all-relevant-ruleset bypass semantics, including
/// its treatment of missing cached rulesets and creation-only bypasses.
async fn evaluate(
    policy: &mut NameRulesPolicy,
    rules: &[Value],
    rulesets: &BTreeMap<u64, Option<String>>,
) -> Result<()> {
    let relevant = rules
        .iter()
        .filter(|rule| {
            matches!(
                rule["type"].as_str(),
                Some("creation" | "branch_name_pattern")
            )
        })
        .filter_map(|rule| rule["ruleset_id"].as_u64())
        .collect::<std::collections::BTreeSet<_>>();
    if relevant.is_empty() {
        policy.status = "checked".into();
        policy.result = "pass".into();
        return Ok(());
    }
    let mut metadata = Vec::new();
    let mut creation = "none";
    for rule in rules {
        let id = rule["ruleset_id"]
            .as_u64()
            .context("Invalid branch ruleset ID")?;
        let Some(Some(bypass)) = rulesets.get(&id) else {
            continue;
        };
        let enforced = bypass != "always";
        match rule["type"].as_str() {
            Some("creation") => {
                if creation != "enforced" {
                    creation = if enforced { "enforced" } else { "bypass" };
                }
            }
            Some(
                "branch_name_pattern"
                | "commit_message_pattern"
                | "commit_author_email_pattern"
                | "committer_email_pattern",
            ) => {
                if let Some(parameters) = rule.get("parameters").filter(|v| !v.is_null()) {
                    validate_parameters(parameters)?;
                    metadata.push((
                        id,
                        enforced,
                        parameters.clone(),
                        rule["type"] == "branch_name_pattern",
                    ));
                }
            }
            _ => {}
        }
    }
    let parameters=metadata.iter().map(|v|json!({"operator":v.2["operator"],"pattern":v.2["pattern"],"negate":v.2["negate"].as_bool().unwrap_or(false)})).collect();
    let branch = policy.branch.clone();
    let matches = cancellation::blocking(move || match_rules(parameters, branch)).await?;
    for ((id, enforced, parameters, is_branch), matched) in metadata.into_iter().zip(matches) {
        if is_branch && !matched {
            let failure = NameRuleFailure {
                ruleset_id: id,
                description: description(&parameters),
            };
            if enforced {
                policy.failed.push(failure);
            } else {
                policy.bypassed.push(failure);
            }
        }
    }
    policy.creation_restricted = creation.into();
    policy.status = "checked".into();
    if creation != "enforced" && policy.failed.is_empty() && policy.bypassed.is_empty() {
        policy.result = "pass".into();
    } else if relevant
        .iter()
        .any(|id| rulesets.get(id).and_then(|value| value.as_deref()) != Some("always"))
    {
        policy.result = "blocked".into();
        policy.reason = Some(format!(
            "Branch name '{}' is restricted by repo rules.",
            policy.branch
        ));
    } else {
        policy.result = "warning".into();
        policy.reason = Some(format!(
            "Branch name '{}' is restricted by repo rules, but you can bypass them. Proceed with caution!",
            policy.branch
        ));
    }
    Ok(())
}

fn principal(value: &Value) -> Result<(NameRulesActor, Option<String>)> {
    let id = value["id"]
        .as_u64()
        .filter(|id| *id > 0)
        .context("Invalid authenticated GitHub principal")?;
    let login = value["login"]
        .as_str()
        .filter(|login| {
            !login.is_empty()
                && login.len() <= 256
                && login
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"-_.[]".contains(&b))
        })
        .context("Invalid authenticated GitHub login")?;
    let plan = value
        .get("plan")
        .and_then(|value| value.get("name"))
        .and_then(Value::as_str)
        .map(str::to_owned);
    Ok((
        NameRulesActor {
            id,
            login: login.into(),
        },
        plan,
    ))
}
fn repository_details(value: &Value, identity: &RepositoryIdentity) -> Result<(u64, String, bool)> {
    let id = value["id"]
        .as_u64()
        .filter(|id| *id > 0)
        .context("Invalid GitHub repository ID")?;
    let full = value["full_name"]
        .as_str()
        .context("Missing GitHub repository identity")?;
    let owner = value["owner"]["login"]
        .as_str()
        .context("Missing GitHub repository owner")?;
    let name = value["name"]
        .as_str()
        .context("Missing GitHub repository name")?;
    let url = value["html_url"]
        .as_str()
        .context("Missing GitHub repository URL")?;
    anyhow::ensure!(
        RepositoryIdentity::from_url(url)? == *identity
            && full.eq_ignore_ascii_case(&format!("{}/{}", identity.owner, identity.name))
            && owner.eq_ignore_ascii_case(&identity.owner)
            && name.eq_ignore_ascii_case(&identity.name),
        "GitHub rule response belongs to another repository"
    );
    let private = value["private"]
        .as_bool()
        .context("Missing GitHub repository privacy")?;
    Ok((id, owner.into(), private))
}
async fn api(
    session: &crate::github_api::Session,
    request: crate::github_api::Request<'_>,
) -> Result<Value> {
    session
        .get(request)
        .await?
        .map_err(|_| anyhow::anyhow!("GitHub branch-rule metadata is unavailable"))
}
impl Repository {
    async fn complete_name_rules(
        &self,
        context_basis: &str,
        policy: NameRulesPolicy,
        witness: Value,
    ) -> Result<NameRulesPolicy> {
        cancellation::Cancellation::current().check()?;
        anyhow::ensure!(
            self.branch_context().await?.view.basis == context_basis,
            "Repository association changed while checking branch rules; review again"
        );
        bind_policy(context_basis, policy, witness)
    }
    /// Explicit branch-name checks may access GitHub; snapshots never call this.
    pub(crate) async fn branch_name_rules(&self, name: &str) -> Result<NameRulesPolicy> {
        self.validate_branch(name).await?;
        anyhow::ensure!(
            name.len() <= 8192,
            "Branch name exceeds the rules validation limit"
        );
        let context = self.branch_context().await?.view;
        let mut policy = NameRulesPolicy::new(name);
        if context.status != "verified" {
            policy.reason=Some("No currently verified GitHub repository association; branch rules were not checked".into());
            return bind_policy(
                &context.basis,
                policy,
                json!({"skip":"unverified_association"}),
            );
        }
        let identity = context
            .repository
            .as_ref()
            .context("Missing verified repository association")?
            .identity
            .clone();
        policy.repository = Some(identity.clone());
        if !supported_host(&identity.host) {
            policy.reason = Some(
                "Branch rules are not supported for this GitHub Enterprise Server endpoint".into(),
            );
            return bind_policy(&context.basis, policy, json!({"skip":"unsupported_host"}));
        }
        let session = match self.open_rule_session(&identity).await? {
            Ok(session) => session,
            Err(failure) => {
                let no_account = failure.is_no_account();
                policy.status = if no_account { "skipped" } else { "unavailable" }.into();
                policy.reason = Some(
                    if no_account {
                        "No authenticated GitHub account; branch rules were not checked"
                    } else {
                        "GitHub authentication is unavailable; branch rules were not checked"
                    }
                    .into(),
                );
                return self
                    .complete_name_rules(
                        &context.basis,
                        policy,
                        json!({"authentication_code":failure.exit_code()}),
                    )
                    .await;
            }
        };
        let outcome = self
            .collect_name_rules(&session, &identity, &mut policy)
            .await;
        cancellation::Cancellation::current().check()?;
        let witness = match outcome {
            Ok(witness) => witness,
            Err(_) => {
                policy.status = "unavailable".into();
                policy.reason=Some(if policy.result=="blocked" {"Cannot safely evaluate the repository's branch-name rules; refresh the review before retrying"} else {"GitHub branch rules are unavailable; this local operation has not been validated against repository rules"}.into());
                json!({"unavailable":true})
            }
        };
        self.complete_name_rules(&context.basis, policy, witness)
            .await
    }
    async fn collect_name_rules(
        &self,
        session: &crate::github_api::Session,
        identity: &RepositoryIdentity,
        policy: &mut NameRulesPolicy,
    ) -> Result<Value> {
        use crate::github_api::{MAX_PAGES, Request};
        let user = api(session, Request::User).await?;
        policy.result = "blocked".into();
        let (actor, plan) = principal(&user)?;
        policy.actor = Some(actor.clone());
        policy.result = "not_checked".into();
        let details = api(session, Request::Repository).await?;
        policy.result = "blocked".into();
        let (repository_id, owner, private) = repository_details(&details, identity)?;
        if owner == actor.login && private && plan.as_deref().is_none_or(|plan| plan == "free") {
            policy.status = "skipped".into();
            policy.result = "not_checked".into();
            policy.reason=Some("The authenticated owner's private repository has a missing or free plan; branch rules were not checked".into());
            return Ok(
                json!({"repository_id":repository_id,"private":private,"plan":plan,"skip":"owner_plan"}),
            );
        }
        policy.result = "not_checked".into();
        let mut rules = Vec::new();
        let mut complete = false;
        for page in 1..=MAX_PAGES {
            let response = api(
                session,
                Request::BranchRules {
                    branch: &policy.branch,
                    page,
                },
            )
            .await?;
            let values = response.as_array().context("Invalid GitHub branch rules")?;
            rules.extend(values.iter().cloned());
            if values.len() < 100 {
                complete = true;
                break;
            }
        }
        anyhow::ensure!(
            complete,
            "GitHub branch-rule pagination exceeds the supported limit"
        );
        policy.result = "blocked".into();
        let mut rulesets = BTreeMap::new();
        let mut missing = false;
        let relevant = rules.iter().any(|rule| {
            matches!(
                rule["type"].as_str(),
                Some("creation" | "branch_name_pattern")
            )
        });
        for rule in rules.iter().filter(|_| relevant) {
            let id = rule["ruleset_id"]
                .as_u64()
                .filter(|id| *id > 0 && *id <= 9_007_199_254_740_991)
                .context("Invalid branch ruleset ID")?;
            if rulesets.contains_key(&id) {
                continue;
            }
            let response = session.get(Request::Ruleset { id }).await?;
            let bypass = match response {
                Ok(value) => {
                    anyhow::ensure!(
                        value["id"].as_u64() == Some(id),
                        "Ruleset response identity changed"
                    );
                    let bypass = value["current_user_can_bypass"]
                        .as_str()
                        .filter(|value| value.len() <= 64)
                        .unwrap_or("unknown");
                    Some(bypass.to_owned())
                }
                Err(_) => {
                    missing = true;
                    None
                }
            };
            rulesets.insert(id, bypass);
        }
        evaluate(policy, &rules, &rulesets).await?;
        let after = api(session, Request::User).await?;
        anyhow::ensure!(
            principal(&after)? == (actor.clone(), plan.clone()),
            "Authenticated GitHub principal changed while checking branch rules"
        );
        if missing {
            policy.status = "unavailable".into();
            if policy.reason.is_none() {
                policy.reason=Some("Some rulesets were unavailable; the check follows Desktop's missing-ruleset behavior".into());
            }
        }
        Ok(
            json!({"repository_id":repository_id,"private":private,"owner":owner,"plan":plan,"rules":rules,"rulesets":rulesets}),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn parameters(operator: &str, pattern: &str, negate: bool) -> Value {
        json!({"operator":operator,"pattern":pattern,"negate":negate})
    }
    #[test]
    fn embedded_legacy_matcher_preserves_re2js_dialect() {
        let cases = [
            (r"^\w+$", "é", false),
            (r"^\d+$", "٣", false),
            (r"^\s$", "\u{a0}", false),
            (r"\bélan\b", "élan", false),
            (r"\Q.a+\E", ".a+", true),
            (r"\p{Greek}+", "αβ", true),
            (r"^.$", "😀", true),
            (r"foo$", "foo\n", false),
            (r"\141", "a", true),
            (r"[a-z&&[^aeiou]]", "b", false),
            (r"[a-z&&[^aeiou]]", "b]", true),
        ];
        for (pattern, text, expected) in cases {
            assert_eq!(
                match_rules(vec![parameters("regex", pattern, false)], text.into()).unwrap(),
                vec![expected],
                "{pattern} on {text:?}"
            );
        }
        for pattern in [r"\C", r"\1", r"a(?=b)"] {
            assert!(
                match_rules(vec![parameters("regex", pattern, false)], "abc".into()).is_err(),
                "{pattern}"
            );
        }
        assert_eq!(
            match_rules(
                vec![
                    parameters("unknown", "anything", true),
                    parameters("contains", ".", false)
                ],
                "a.b".into()
            )
            .unwrap(),
            vec![false, true]
        );
    }
    #[tokio::test]
    async fn legacy_creation_and_mixed_bypass_semantics_remain_distinct() {
        let rules = vec![json!({"type":"creation","ruleset_id":1})];
        let mut policy = NameRulesPolicy::new("topic");
        evaluate(
            &mut policy,
            &rules,
            &BTreeMap::from([(1, Some("always".into()))]),
        )
        .await
        .unwrap();
        assert_eq!(policy.result, "pass");
        assert_eq!(policy.creation_restricted, "bypass");
        let rules = vec![
            json!({"type":"branch_name_pattern","ruleset_id":1,"parameters":parameters("starts_with","feature/",false)}),
            json!({"type":"branch_name_pattern","ruleset_id":2,"parameters":parameters("contains","topic",false)}),
        ];
        let mut policy = NameRulesPolicy::new("topic");
        evaluate(
            &mut policy,
            &rules,
            &BTreeMap::from([(1, Some("always".into())), (2, Some("never".into()))]),
        )
        .await
        .unwrap();
        assert_eq!(policy.result, "blocked");
        assert!(policy.failed.is_empty());
        assert_eq!(policy.bypassed.len(), 1);
        let mut policy = NameRulesPolicy::new("topic");
        evaluate(&mut policy, &rules, &BTreeMap::from([(1, None), (2, None)]))
            .await
            .unwrap();
        assert_eq!(policy.result, "pass");
    }
    #[tokio::test]
    async fn cancelled_and_oversized_matching_does_not_produce_permission() {
        let token = cancellation::Cancellation::default();
        token.cancel();
        let result = token
            .scope(cancellation::blocking(|| {
                match_rules(vec![parameters("regex", ".*", false)], "topic".into())
            }))
            .await;
        assert!(result.unwrap_err().to_string().contains("cancelled"));
        let huge = vec![parameters("contains", &"a".repeat(8192), false); 129];
        assert!(match_rules(huge, "topic".into()).is_err());
    }
    #[test]
    fn repository_and_actor_checks_keep_their_identity() {
        let identity = RepositoryIdentity::from_url("https://github.com/Owner/Project").unwrap();
        let value = json!({"id":7,"full_name":"Owner/Project","name":"Project","owner":{"login":"Owner"},"html_url":"https://github.com/Owner/Project","private":true});
        assert!(repository_details(&value, &identity).is_ok());
        let other = RepositoryIdentity::from_url("https://github.com/Other/Project").unwrap();
        assert!(repository_details(&value, &other).is_err());
        assert!(principal(&json!({"id":0,"login":"Owner"})).is_err());
        assert!(supported_host("tenant.ghe.com"));
        assert!(supported_host("github.com:443"));
        assert!(!supported_host("github.com.attacker.test"));
        assert!(!supported_host("ghe.com"));
    }
}

#[cfg(test)]
#[path = "repo_rules/parity_tests.rs"]
mod parity_tests;
