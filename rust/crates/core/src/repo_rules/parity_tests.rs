//! Frozen results from the authoritative Desktop/RE2JS oracle, not a second
//! implementation of the matching or bypass policy.
use super::*;

const ENGINE: &str = include_str!("../../../../tests/branch-rules-oracle/engine-expected.json");
const INPUTS: &str = include_str!("../../../../tests/branch-rules-oracle/cases.json");
const EXPECTED: &str = include_str!("../../../../tests/branch-rules-oracle/expected.json");

fn normalize_parameters(value: &Value) -> Value {
    let mut parameters = value.clone();
    parameters
        .as_object_mut()
        .expect("oracle metadata parameters")
        .entry("negate")
        .or_insert(Value::Bool(false));
    parameters
}

#[test]
fn embedded_matcher_agrees_with_the_entire_frozen_engine_corpus() {
    let fixture: Value = serde_json::from_str(ENGINE).unwrap();
    assert_eq!(fixture["version"], 1);
    assert_eq!(fixture["engine"], "re2js@2.0.1");
    let cases = fixture["cases"].as_array().unwrap();
    assert_eq!(cases.len(), 91, "retain the full frozen engine corpus");
    for case in cases {
        let id = case["id"].as_str().unwrap();
        let actual = match_rules(
            vec![normalize_parameters(&case["parameters"])],
            case["branch"].as_str().unwrap().to_owned(),
        );
        if let Some(expected) = case["outcome"]["matched"].as_bool() {
            assert_eq!(
                actual.unwrap_or_else(|error| panic!("{id}: unexpected matcher error: {error}")),
                vec![expected],
                "{id}"
            );
        } else {
            assert_eq!(case["outcome"]["status"], "error", "{id}");
            assert!(actual.is_err(), "{id}: invalid legacy pattern was accepted");
        }
    }
}

fn failures(values: &[NameRuleFailure]) -> Vec<Value> {
    values
        .iter()
        .map(|value| json!({"rulesetId":value.ruleset_id,"description":value.description}))
        .collect()
}

#[tokio::test]
async fn evaluated_policy_agrees_with_frozen_legacy_checker_and_parsed_failures() {
    let inputs: Value = serde_json::from_str(INPUTS).unwrap();
    let expected: Value = serde_json::from_str(EXPECTED).unwrap();
    assert_eq!(inputs["version"], 1);
    assert_eq!(expected["engine"], "re2js@2.0.1");
    let expected = expected["cases"]
        .as_array()
        .unwrap()
        .iter()
        .map(|case| (case["id"].as_str().unwrap(), case))
        .collect::<BTreeMap<_, _>>();
    let mut checked = 0;
    for input in inputs["cases"].as_array().unwrap() {
        let id = input["id"].as_str().unwrap();
        let oracle = expected[id];
        // Account/association/capability gates and API transport failures are
        // covered by service integration tests, rather than evaluate().
        if input.get("api_error").is_some() || oracle["api_calls"].as_array().unwrap().is_empty() {
            continue;
        }
        checked += 1;
        let rules = input["rules"].as_array().unwrap();
        let cached = input["rulesets"]
            .as_array()
            .unwrap()
            .iter()
            .map(|ruleset| (ruleset["id"].as_u64().unwrap(), ruleset))
            .collect::<BTreeMap<_, _>>();
        let rulesets = rules
            .iter()
            .map(|rule| {
                let id = rule["ruleset_id"].as_u64().unwrap();
                let bypass = cached.get(&id).map(|ruleset| {
                    ruleset["current_user_can_bypass"]
                        .as_str()
                        .unwrap_or("unknown")
                        .to_owned()
                });
                (id, bypass)
            })
            .collect::<BTreeMap<_, _>>();
        let mut policy = NameRulesPolicy::new(input["branch"].as_str().unwrap());
        let actual = evaluate(&mut policy, rules, &rulesets).await;
        if oracle["check"]["status"] == "error" {
            assert!(
                actual.is_err(),
                "{id}: legacy checker error became permission"
            );
            continue;
        }
        actual.unwrap_or_else(|error| panic!("{id}: unexpected policy error: {error}"));
        assert_eq!(policy.result, oracle["check"]["status"], "{id}");
        assert_eq!(
            policy.reason.as_deref(),
            oracle["check"]["message"].as_str(),
            "{id}"
        );
        let creation = match &oracle["parsed"]["creation_restricted"] {
            Value::Bool(false) => "none",
            Value::Bool(true) => "enforced",
            Value::String(value) if value == "bypass" => "bypass",
            other => panic!("{id}: unexpected frozen creation restriction: {other}"),
        };
        assert_eq!(policy.creation_restricted, creation, "{id}");
        assert_eq!(
            failures(&policy.failed),
            *oracle["parsed"]["failed"].as_array().unwrap(),
            "{id}"
        );
        assert_eq!(
            failures(&policy.bypassed),
            *oracle["parsed"]["bypassed"].as_array().unwrap(),
            "{id}"
        );
    }
    assert_eq!(checked, 114, "retain all eligible frozen checker cases");
}
