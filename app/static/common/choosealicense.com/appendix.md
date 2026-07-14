---
layout: default
permalink: /appendix/
title: Appendix
title_key: page_title_appendix
class: license-types
---

{% include t.html key="appendix_intro" %}

{% assign i18n_lang = site.active_lang | default: site.default_lang %}
{% assign loc_rules = site.data.i18n[i18n_lang].rules %}
<table border style="font-size: xx-small; position: relative">
{% assign types = "permissions|conditions|limitations" | split: "|" %}
<tr style="position: sticky; top: 0; z-index: 1000001; background: color-mix(in srgb, var(--backgroundColor) 70%, transparent);">
  <th scope="col" style="text-align: center">{% include t.html key="appendix_col_license" %}</th>
  {% assign seen_tags = '' %}
  {% for type in types %}
    {% assign rules = site.data.rules[type] | sort: "label" %}
    {% for rule_obj in rules %}
      {% if seen_tags contains rule_obj.tag or rule_obj.tag contains '--' %}
        {% continue %}
      {% endif %}
      {% capture seen_tags %}{{ seen_tags | append:rule_obj.tag }}{% endcapture %}
      {% assign lrule = loc_rules[type][rule_obj.tag] %}
      <th scope="col" style="text-align: center; width:7%"><a href="#{{ rule_obj.tag }}">{{ lrule.label | default: rule_obj.label }}</a></th>
    {% endfor %}
  {% endfor %}
</tr>
{% assign licenses = site.licenses | sort: "path" %}
{% for license in licenses %}
  <tr style="height: 3em"><th scope="row"><a href="{{ license.id }}">{{ license.title }}</a></th>
  {% assign seen_tags = '' %}
  {% for type in types %}
    {% assign rules = site.data.rules[type] | sort: "label" %}
    {% for rule_obj in rules %}
      {% assign req = rule_obj.tag %}
      {% if seen_tags contains req  or rule_obj.tag contains '--' %}
        {% continue %}
      {% endif %}
      {% capture seen_tags %}{{ seen_tags | append:req }}{% endcapture %}
      {% assign seen_req = false %}
      {% for t in types %}
        {% for r in license[t] %}
          {% if r contains req %}
            <td class="license-{{ t }}" style="text-align:center">
              {% if r contains "--" %}
                {% assign lite = "lite" %}
              {% else %}
                {% assign lite = "" %}
              {% endif %}
              <span class="{{ lite }}" style="margin: auto;">
                <span class="license-marker {{ r }}">{% if t == "permissions" %}✓{% elsif t == "conditions" %}ⓘ{% else %}✕{% endif %}</span>
              </span>
            </td>
            {% assign seen_req = true %}
          {% endif %}
        {% endfor %}
      {% endfor %}
      {% unless seen_req %}
        <td></td>
      {% endunless %}
    {% endfor %}
  {% endfor %}
  </tr>
{% endfor %}
</table>

## {% include t.html key="appendix_legend_heading" %}

<p>{% include t.html key="appendix_legend_permissions_html" %}</p>

<p>{% include t.html key="appendix_legend_conditions_html" %}</p>

<p>{% include t.html key="appendix_legend_limitations_html" %}</p>

{% for type in types %}
### {% if type == "permissions" %}{% include t.html key="rules_permissions" %}{% elsif type == "conditions" %}{% include t.html key="rules_conditions" %}{% else %}{% include t.html key="rules_limitations" %}{% endif %}
  <dl>
  {% assign rules = site.data.rules[type] | sort: "label" %}
  {% for rule_obj in rules %}
    {% assign req = rule_obj.tag %}
    {% assign lrule = loc_rules[type][req] %}
    <dt id="{{ req }}">{{ lrule.label | default: rule_obj.label }}</dt>
    <dd class="license-{{ type }}">
      {% if req contains "--" %}
        {% assign lite = " lite" %}
      {% else %}
        {% assign lite = "" %}
      {% endif %}
      <span class="{{ lite | strip }}">
        <span class="license-marker {{ req }}">{% if type == "permissions" %}✓{% elsif type == "conditions" %}ⓘ{% else %}✕{% endif %}</span>
      </span>
      {{ lrule.description | default: rule_obj.description }}
    </dd>
  {% endfor %}
  </dl>
{% endfor %}
