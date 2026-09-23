# GitHub Desktop usage reporting

GitHub Desktop sends certain optional metrics to our analytics system. We want you to understand what is being sent and why this information is important to our ability to improve the product.

## Why do we need usage stats?

**Our team uses metrics to prioritize our work and evaluate whether we are successfully solving real users' problems.** For example, when we released dark theme and a guided way to resolve merge conflicts, we wanted to understand whether people were using those features and whether they provided value.

As a concrete example, suppose we release a feature intended to improve merge conflict resolution. If the percentage of conflicts resolved successfully rises by 20%, that indicates the feature is helping people. Conversely, if the percentage drops by 5%, we know it's time to revisit the feature and assess whether we should iterate or try a different solution. You can see an example of how we think about metrics in [desktop/desktop#5394](https://github.com/desktop/desktop/issues/5394).

**The more people who opt in to send GitHub Desktop usage stats, the more information we have to inform our decisions.** If you want us to take your use cases into consideration, we hope you'll opt in so we can better understand how you use the app and whether it meets your needs.

We are sensitive to the privacy of our users. We examine aggregate data and trends to inform product decisions rather than the activity of specific individuals.

## What usage data does GitHub Desktop send?

If you opt in to usage reporting, the payload contains a pseudonymous `guid` identifier associated with the GitHub Desktop installation. It does not contain your GitHub username or account ID.

GitHub Desktop sends requests in the format shown in our [generated example usage data](./usage-data.json). The field names, value types, and request structure match the application's current implementation. Values such as `1` and `"example"` are synthetic and do not represent data from a real user or device.

Copilot-based features track their own metrics separately. GitHub Desktop relies on the [GitHub Copilot SDK](https://docs.github.com/en/copilot/responsible-use/copilot-cli) for those features. You can learn more in the [GitHub Copilot Trust Center](https://copilot.github.trust.page/).

## Enable or disable usage reporting

You can change your usage-reporting preference at any time. Open GitHub Desktop's settings, select **Advanced**, and enable or disable the option to share usage data.
